import { getSqlite } from "./db";
import { PARTIES } from "./config/parties";
import { confirmedInsufficient } from "./claude/synthesize";

/**
 * « Ce qu'il reste à faire » pour l'administrateur : calculé sur l'état réel de la base,
 * dans l'ordre où les jobs doivent être lancés.
 */
export interface TodoItem {
  kind: string | null; // job à lancer (null = action manuelle)
  title: string;
  why: string;
  level: "urgent" | "utile" | "fait";
}

export function adminTodo(): TodoItem[] {
  const s = getSqlite();
  const n = (sql: string) => (s.prepare(sql).get() as { n: number | null }).n ?? 0;
  const items: TodoItem[] = [];

  const lastIngest = (s.prepare(`SELECT MAX(finished_at) AS d FROM jobs WHERE kind IN ('ingest-an','refresh-all') AND status = 'done'`).get() as { d: string | null }).d;
  const ageDays = lastIngest ? (Date.now() - Date.parse(lastIngest)) / 86400000 : Infinity;
  items.push(
    ageDays > 3
      ? { kind: "refresh-all", title: "Mettre à jour les données", why: lastIngest ? `Dernier import il y a ${Math.floor(ageDays)} jours : de nouveaux votes ont sans doute eu lieu.` : "Aucun import encore fait.", level: "utile" }
      : { kind: null, title: "Données à jour", why: "Votes et élus importés il y a moins de 3 jours.", level: "fait" },
  );

  const unclassified = n(`SELECT COUNT(*) n FROM scrutins WHERE uid NOT IN (SELECT scrutin_uid FROM scrutin_analyses)`);
  items.push(
    unclassified
      ? { kind: "classify-scrutins", title: `Classer ${unclassified.toLocaleString("fr-FR")} votes`, why: "Sans cela, ces votes n'ont ni résumé, ni sujet, et ne comptent pas dans les positions des partis.", level: "urgent" }
      : { kind: null, title: "Tous les votes sont classés", why: "Chaque vote a son résumé, son sujet et son importance.", level: "fait" },
  );

  const confirmed = confirmedInsufficient();
  const toSynth = (s.prepare(`SELECT party_id AS partyId, theme, narrative, verdict, voted_stance AS v, declared_stance AS d FROM party_theme_scores`).all() as { partyId: string; theme: string; narrative: string | null; verdict: string | null; v: number | null; d: number | null }[]).filter(
    (c) => (c.narrative === null && (c.v !== null || c.d !== null)) || (c.verdict === "insuffisant" && c.v !== null && c.d !== null && !confirmed.has(`${c.partyId}|${c.theme}`)),
  ).length;
  items.push(
    toSynth
      ? { kind: "synthesize", title: `Rédiger ou mettre à jour ${toSynth} verdicts « dit / fait »`, why: "Tant que ce job n'a pas tourné, le site affiche « Pas assez d'infos » partout, même quand programmes et votes sont là. ≈ 0,15 $ équiv. par verdict.", level: "urgent" }
      : { kind: null, title: "Verdicts rédigés", why: "Chaque parti × sujet a son verdict et son explication.", level: "fait" },
  );

  const debates = n(`SELECT COUNT(*) n FROM scrutin_debates`);
  const unexplained = n(`SELECT COUNT(*) n FROM scrutin_debates WHERE explanation IS NULL`);
  const unexplainedMajor = n(`SELECT COUNT(*) n FROM scrutin_debates d JOIN scrutin_analyses a ON a.scrutin_uid = d.scrutin_uid WHERE d.explanation IS NULL AND a.salience >= 3`);
  if (!debates) items.push({ kind: "link-debates", title: "Relier les votes aux débats", why: "Retrouve dans les comptes rendus ce qui a été dit avant chaque vote. Gratuit, quelques minutes.", level: "urgent" });
  else
    items.push(
      unexplained
        ? {
            kind: "explain-votes",
            title: `Expliquer les votes (${unexplainedMajor.toLocaleString("fr-FR")} importants, ${unexplained.toLocaleString("fr-FR")} au total)`,
            why: "Ajoute sur chaque vote « En clair », « pourquoi ils ont voté comme ça » et les arguments pour/contre. Les plus importants d'abord, 150 par lancement, ≈ 0,13 $ équiv. chacun.",
            level: unexplainedMajor ? "urgent" : "utile",
          }
        : { kind: null, title: "Votes expliqués", why: "Chaque vote relié à un débat a son explication.", level: "fait" },
    );

  const postsTodo = n(`SELECT COUNT(*) n FROM posts WHERE id NOT IN (SELECT post_id FROM post_analyses) AND kind IN ('qag','explication-vote','communique','tweet')`);
  if (postsTodo) items.push({ kind: "analyze-posts", title: `Analyser ${postsTodo.toLocaleString("fr-FR")} prises de parole importantes`, why: "Questions au gouvernement, explications de vote, communiqués : nourrit « ce qu'il déclare en séance ». 500 par lancement.", level: "utile" });

  const noProfile = n(`SELECT COUNT(*) n FROM candidates WHERE profile IS NULL AND status != 'retire' AND COALESCE(scope, 'in') = 'in'`);
  items.push(
    noProfile
      ? { kind: "candidats", title: `Rédiger ${noProfile} fiches candidats 2027`, why: "Biographies sourcées (sources indépendantes uniquement, affaires judiciaires vérifiées deux fois). ≈ 3,5 à 4,5 $ équiv. par fiche. Relisez la liste des candidats avant de publier le site.", level: "utile" }
      : { kind: null, title: "Fiches candidats rédigées", why: "Relancez de temps en temps avec --force pour suivre l'actualité (justice, candidatures).", level: "fait" },
  );

  const withProgramme = new Set((s.prepare(`SELECT DISTINCT d.party_id AS id FROM document_analyses da JOIN documents d ON d.id = da.document_id`).all() as { id: string }[]).map((r) => r.id));
  const missing = PARTIES.filter((p) => !withProgramme.has(p.id));
  if (missing.length)
    items.push({ kind: null, title: `Programme manquant : ${missing.map((p) => p.shortName).join(", ")}`, why: "Collez le texte ou l'adresse du programme dans « Ajouter un document » plus bas, puis lancez « Analyser les programmes ».", level: "utile" });

  return items;
}
