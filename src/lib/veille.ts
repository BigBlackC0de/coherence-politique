import { getSqlite, nowIso } from "./db";
import type { JobContext } from "./jobs";
import { seedParties } from "./ingest/seed";
import { ingestAnDeputes, ingestAnScrutins } from "./ingest/an";
import { ingestSenat } from "./ingest/senat";
import { ingestAnComptesRendus } from "./ingest/cri-an";
import { ingestSenatComptesRendus } from "./ingest/cri-senat";
import { linkDebates } from "./ingest/debates";
import { classifyScrutins } from "./claude/classify-scrutins";
import { explainVotes } from "./claude/explain-votes";
import { synthesizeCoherence } from "./claude/synthesize";
import { computeAllScores } from "./analysis/scores";

/**
 * Veille parlementaire : à lancer régulièrement (voir scripts/veille.ts).
 * Vérifie l'Assemblée et le Sénat, puis traite uniquement ce qui est nouveau :
 * classification des nouveaux scrutins, débats, explications, scores, et
 * synthèses des seuls thèmes touchés par un vote notable. Sans nouveauté, le coût est nul.
 */
export const VEILLE_KEY = "veille:last";

export interface VeilleReport {
  at: string;
  newAN: number;
  newSenat: number;
  classified: number;
  explained: number;
  themesRefreshed: string[];
  /** Vrai si la base a changé : c'est le signal pour republier le site. */
  changed: boolean;
}

/** Un vote d'importance 3 ou plus (article important, ensemble d'un texte, texte majeur) justifie de réécrire les synthèses du thème. */
const MIN_SALIENCE_FOR_SYNTHESIS = 3;
/** Les débats ne sont publiés que quelques jours après le vote : on explique ceux des 45 derniers jours. */
const EXPLAIN_WINDOW_DAYS = 45;

export async function veilleParlementaire(ctx: JobContext): Promise<VeilleReport> {
  const sqlite = getSqlite();
  const allUids = () => new Set((sqlite.prepare(`SELECT uid FROM scrutins`).all() as { uid: string }[]).map((r) => r.uid));
  const explainedCount = () => (sqlite.prepare(`SELECT COUNT(*) n FROM scrutin_debates WHERE explanation IS NOT NULL`).get() as { n: number }).n;

  const before = allUids();
  const explainedBefore = explainedCount();

  ctx.setProgress(0, 5, "Veille : Assemblée nationale et Sénat…");
  seedParties();
  await ingestAnDeputes(ctx);
  await ingestAnScrutins(ctx);
  try {
    await ingestSenat(ctx);
  } catch (e) {
    ctx.log(`Sénat ignoré : ${(e as Error).message}`);
  }
  const fresh = [...allUids()].filter((u) => !before.has(u));
  const newSenat = fresh.filter((u) => u.startsWith("SEN-")).length;
  const newAN = fresh.length - newSenat;
  ctx.log(`Nouveautés : ${newAN} scrutins à l'Assemblée, ${newSenat} au Sénat`);

  // Classification : les nouveaux scrutins, plus tout ce qui aurait été raté lors d'un passage précédent.
  ctx.setProgress(1, 5, "Veille : classification des nouveaux scrutins…");
  const pending = (sqlite.prepare(`SELECT uid FROM scrutins WHERE uid NOT IN (SELECT scrutin_uid FROM scrutin_analyses)`).all() as { uid: string }[]).map((r) => r.uid);
  if (pending.length) await classifyScrutins(ctx);

  // Thèmes touchés par un vote notable (non procédural).
  const themes = new Set<string>();
  let classified = 0;
  for (let i = 0; i < pending.length; i += 500) {
    const chunk = pending.slice(i, i + 500);
    const rows = sqlite
      .prepare(`SELECT primary_theme, themes, is_procedural, salience FROM scrutin_analyses WHERE scrutin_uid IN (${chunk.map(() => "?").join(",")})`)
      .all(...chunk) as { primary_theme: string | null; themes: string; is_procedural: number; salience: number }[];
    classified += rows.length;
    for (const r of rows) {
      if (r.is_procedural || r.salience < MIN_SALIENCE_FOR_SYNTHESIS) continue;
      if (r.primary_theme) themes.add(r.primary_theme);
      try {
        for (const t of JSON.parse(r.themes) as { theme: string }[]) themes.add(t.theme);
      } catch {
        /* thèmes illisibles : le thème principal suffit */
      }
    }
  }

  // Débats et explications : les comptes rendus arrivent après le vote, donc on traite aussi les votes des dernières semaines.
  ctx.setProgress(2, 5, "Veille : débats et explications…");
  try {
    await ingestAnComptesRendus(ctx);
  } catch (e) {
    ctx.log(`Comptes rendus AN ignorés : ${(e as Error).message}`);
  }
  try {
    await ingestSenatComptesRendus(ctx);
  } catch (e) {
    ctx.log(`Comptes rendus Sénat ignorés : ${(e as Error).message}`);
  }
  try {
    await linkDebates(ctx);
  } catch (e) {
    ctx.log(`Débats ignorés : ${(e as Error).message}`);
  }
  const toExplain = (
    sqlite
      .prepare(`SELECT d.scrutin_uid AS uid FROM scrutin_debates d JOIN scrutins s ON s.uid = d.scrutin_uid WHERE d.explanation IS NULL AND s.date >= date('now', ?)`)
      .all(`-${EXPLAIN_WINDOW_DAYS} day`) as { uid: string }[]
  ).map((r) => r.uid);
  if (toExplain.length) await explainVotes(ctx, { uids: toExplain, limit: 200 });

  ctx.setProgress(3, 5, "Veille : scores…");
  computeAllScores(ctx.log);

  const themesRefreshed = [...themes];
  if (themesRefreshed.length) {
    ctx.setProgress(4, 5, `Veille : synthèses des thèmes touchés (${themesRefreshed.length})…`);
    await synthesizeCoherence(ctx, { themes: themesRefreshed, force: true });
  } else {
    ctx.log("Aucun vote notable nouveau : synthèses inchangées");
  }

  const explained = explainedCount() - explainedBefore;
  const report: VeilleReport = {
    at: nowIso(),
    newAN,
    newSenat,
    classified,
    explained,
    themesRefreshed,
    changed: newAN + newSenat > 0 || classified > 0 || explained > 0 || themesRefreshed.length > 0,
  };
  sqlite
    .prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(VEILLE_KEY, JSON.stringify(report), report.at);
  ctx.setProgress(5, 5, report.changed ? `Veille : ${newAN + newSenat} nouveaux scrutins, ${classified} classés, ${explained} votes expliqués` : "Veille : rien de nouveau");
  ctx.log(report.changed ? `Terminé : ${JSON.stringify(report)}` : "Rien de nouveau depuis le dernier passage.");
  return report;
}
