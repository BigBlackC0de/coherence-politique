import { getSqlite } from "./db";
import type { DebateTurn, VoteExplanation } from "./db/schema";

/** Débat en séance qui précède un scrutin, et son explication en langage courant (si déjà produite). */
export function scrutinDebate(uid: string) {
  const r = getSqlite()
    .prepare(`SELECT scrutin_uid AS scrutinUid, source, cr_ref AS crRef, url, turns, explanation, explain_model AS explainModel, explained_at AS explainedAt FROM scrutin_debates WHERE scrutin_uid = ?`)
    .get(uid) as { scrutinUid: string; source: string; crRef: string; url: string | null; turns: string; explanation: string | null; explainModel: string | null; explainedAt: string | null } | undefined;
  if (!r) return null;
  return { ...r, turns: JSON.parse(r.turns) as DebateTurn[], explanation: r.explanation ? (JSON.parse(r.explanation) as VoteExplanation) : null };
}

/** Vote de moins de `days` jours (la page officielle de l'AN n'est souvent pas encore publiée). */
export const isRecentDate = (date: string, days = 7) => Date.now() - Date.parse(date) < days * 86400000;

/** Ce qu'il faut pour annoncer une explication dans une liste : titre clair et enjeu. */
export interface DebateHeadline {
  uid: string;
  titre: string | null;
  enjeu: string | null;
}

/** Titres et enjeux des votes déjà expliqués, pour une liste d'identifiants (les autres sont absents de la table). */
export function debateHeadlines(uids: string[]): Map<string, DebateHeadline> {
  const out = new Map<string, DebateHeadline>();
  if (!uids.length) return out;
  const rows = getSqlite()
    .prepare(`SELECT scrutin_uid AS uid, json_extract(explanation, '$.titre') AS titre, json_extract(explanation, '$.enjeu') AS enjeu FROM scrutin_debates WHERE explanation IS NOT NULL AND scrutin_uid IN (${uids.map(() => "?").join(",")})`)
    .all(...uids) as DebateHeadline[];
  for (const r of rows) out.set(r.uid, r);
  return out;
}

/** Derniers votes dont le débat a été expliqué en langage courant. */
export function recentExplainedVotes(limit = 4) {
  return getSqlite()
    .prepare(
      `SELECT s.uid, s.date, s.chamber, s.sort, s.title, a.summary, json_extract(d.explanation, '$.titre') AS titre, json_extract(d.explanation, '$.enjeu') AS enjeu
       FROM scrutin_debates d JOIN scrutins s ON s.uid = d.scrutin_uid LEFT JOIN scrutin_analyses a ON a.scrutin_uid = s.uid
       WHERE d.explanation IS NOT NULL ORDER BY s.date DESC, s.uid DESC LIMIT ?`,
    )
    .all(limit) as { uid: string; date: string; chamber: string; sort: string | null; title: string; summary: string | null; titre: string | null; enjeu: string | null }[];
}
