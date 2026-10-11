import { startJob, type JobContext, isJobRunning } from "./jobs";
import { seedParties } from "./ingest/seed";
import { ingestAnDeputes, ingestAnScrutins } from "./ingest/an";
import { ingestSenat } from "./ingest/senat";
import { ingestAnComptesRendus } from "./ingest/cri-an";
import { ingestSenatComptesRendus } from "./ingest/cri-senat";
import { ingestRss } from "./ingest/rss";
import { linkDebates } from "./ingest/debates";
import { explainVotes } from "./claude/explain-votes";
import { xConfigured } from "./x/client";
import { classifyScrutins } from "./claude/classify-scrutins";
import { discoverProgrammes, processProgrammes } from "./claude/programmes";
import { ingestX, analyzePosts, checkClaims } from "./claude/posts";
import { synthesizeCoherence } from "./claude/synthesize";
import { computeAllScores } from "./analysis/scores";
import { runCandidatesJob, auditAssets, type CandidatesJobParams } from "./claude/candidates";
import { veilleParlementaire } from "./veille";

/**
 * Catalogue des jobs lançables depuis l'UI ou le CLI.
 * Chaque job est idempotent / incrémental : relancer ne refait que le manquant.
 */
export const JOB_KINDS = {
  "ingest-an": { label: "Importer l'Assemblée nationale", desc: "Députés, groupes, 8 000+ scrutins et votes nominatifs (open data officiel). Gratuit.", claude: false },
  "ingest-senat": { label: "Importer le Sénat", desc: "Sénateurs, scrutins publics et votes individuels (NosParlementaires / data.senat.fr). Gratuit.", claude: false },
  "classify-scrutins": { label: "Classifier les scrutins", desc: "Cohérence-Politique attribue thèmes, sens et importance à chaque scrutin non encore analysé. ≈ 15–40 $ pour la législature complète en Opus 5 (incrémental ensuite).", claude: true },
  "discover-programmes": { label: "Trouver les programmes", desc: "Cohérence-Politique cherche sur le web les programmes officiels actuels de chaque parti. ≈ 1–3 $.", claude: true },
  "process-programmes": { label: "Analyser les programmes", desc: "Récupère les documents trouvés (PDF/pages) et les positionne thème par thème. ≈ 1–2 $ par document.", claude: true },
  programmes: { label: "Programmes : tout automatiser", desc: "Enchaîne la recherche web des programmes officiels des 11 partis puis leur analyse thème par thème. ≈ 10–25 $ équiv.", claude: true },
  "ingest-cri": { label: "Importer les prises de parole", desc: "Comptes rendus intégraux des séances AN et Sénat (open data) : questions au gouvernement, explications de vote, discussions générales, rattachées à chaque parlementaire. Gratuit.", claude: false },
  "link-debates": { label: "Relier les votes aux débats", desc: "Retrouve, dans les comptes rendus officiels AN et Sénat, le débat qui précède chaque scrutin (présentation, avis, explications de vote). Gratuit.", claude: false },
  "explain-votes": { label: "Expliquer les votes", desc: "Cohérence-Politique lit le débat de chaque scrutin et explique en mots simples ce qui était voté et pourquoi chaque groupe a voté pour ou contre. Les plus importants d'abord, 150 par passage ; ≈ 0,10 $ chacun.", claude: true },
  "ingest-rss": { label: "Importer les communiqués", desc: "Flux RSS officiels des partis (communiqués, actualités). Gratuit.", claude: false },
  "ingest-x": { label: "Rafraîchir X (optionnel)", desc: "Lit les nouveaux tweets des comptes suivis — nécessite un accès API X payant (≈ 0,005 $ par tweet).", claude: false },
  "analyze-posts": { label: "Analyser les prises de parole", desc: "Thèmes, ton, affirmations vérifiables, par ordre de priorité (QAG, explications de vote, communiqués…). 500 par passage par défaut ; ≈ 0,04 $ chacune.", claude: true },
  "check-claims": { label: "Vérifier les affirmations", desc: "Confronte les affirmations des prises de parole aux votes réels. ≈ 0,05 $ par affirmation.", claude: true },
  "compute-scores": { label: "Recalculer les scores", desc: "Positions votées / déclarées / écarts, par parti et par parlementaire. Gratuit, instantané.", claude: false },
  "synthesize": { label: "Synthèses dire / faire", desc: "Cohérence-Politique rédige, pour chaque parti × thème, le verdict de cohérence avec preuves. ≈ 0,15 $ par cellule (≈ 150 cellules).", claude: true },
  candidats: { label: "Candidats à la présidentielle", desc: "Recherche web des candidats déclarés ou pressentis pour 2027, photo libre (Wikimedia Commons) et fiche biographique sourcée (sources indépendantes uniquement ; faits sans source écartés). Seules les fiches manquantes sont rédigées. ≈ 1–3 $ équiv. par fiche.", claude: true },
  "candidats-perimetre": { label: "Candidats : périmètre", desc: "Revérifie, pour chaque personne de la liste, les trois critères d'entrée (parti avec des parlementaires, candidature officielle antérieure, sondage récent à 1 % ou plus). Les décisions de l'administrateur sont conservées. ≈ 0,15 $ équiv. par personne.", claude: true },
  "candidats-fiches": { label: "Candidats : fiches ciblées", desc: "Rédige (ou refait avec force) les fiches des candidats indiqués (ids), avec la passe judiciaire vérifiée. Peut tourner en parallèle du job « Candidats ». ≈ 4 $ équiv. par fiche.", claude: true },
  veille: { label: "Veille parlementaire", desc: "Vérifie l'Assemblée et le Sénat ; ne traite que les nouveaux scrutins (classification, débats, explications, scores) et réécrit les synthèses des seuls thèmes touchés par un vote notable. Sans nouveauté : aucun coût. À planifier (npm run veille).", claude: true },
  "candidats-patrimoine": { label: "Candidats : contrôle patrimoine et justice", desc: "Revérifie les rubriques sensibles de chaque fiche : patrimoine (seuls les faits dont les montants figurent exactement dans un document officiel sont conservés) et justice (chiffres et tournures de presse absents des documents cités retirés). Aucun appel à Claude, lecture de pages seulement. Gratuit.", claude: false },
  "refresh-all": { label: "Tout rafraîchir", desc: "Enchaîne : import AN + Sénat → classification des nouveaux scrutins → prises de parole (séances, communiqués, X si configuré) → débats des votes → analyse → explication des nouveaux votes → scores → verdicts → candidats (nouvelles candidatures chaque semaine, fiches manquantes).", claude: true },
} as const;
export type JobKind = keyof typeof JOB_KINDS;

const RUNNERS: Record<JobKind, (ctx: JobContext, params?: Record<string, unknown>) => Promise<void>> = {
  "ingest-an": async (ctx) => {
    seedParties();
    await ingestAnDeputes(ctx);
    await ingestAnScrutins(ctx);
    computeAllScores(ctx.log);
  },
  "ingest-senat": async (ctx) => {
    seedParties();
    await ingestSenat(ctx);
    computeAllScores(ctx.log);
  },
  "classify-scrutins": async (ctx, params) => {
    await classifyScrutins(ctx, { limit: params?.limit ? Number(params.limit) : undefined, chamber: params?.chamber as "AN" | "SENAT" | undefined });
    computeAllScores(ctx.log);
  },
  "discover-programmes": async (ctx, params) => {
    seedParties();
    await discoverProgrammes(ctx, params?.partyIds as string[] | undefined);
  },
  "process-programmes": async (ctx) => {
    await processProgrammes(ctx);
    computeAllScores(ctx.log);
  },
  programmes: async (ctx, params) => {
    seedParties();
    await discoverProgrammes(ctx, params?.partyIds as string[] | undefined);
    await processProgrammes(ctx);
    computeAllScores(ctx.log);
  },
  "ingest-cri": async (ctx) => {
    seedParties();
    await ingestAnComptesRendus(ctx);
    try {
      await ingestSenatComptesRendus(ctx);
    } catch (e) {
      ctx.log(`Sénat ignoré : ${(e as Error).message}`);
    }
    await linkDebates(ctx);
  },
  "link-debates": async (ctx) => {
    await linkDebates(ctx);
  },
  "explain-votes": async (ctx, params) => {
    await explainVotes(ctx, { limit: params?.limit ? Number(params.limit) : undefined, uids: params?.uids as string[] | undefined });
  },
  "ingest-rss": async (ctx) => {
    seedParties();
    await ingestRss(ctx);
  },
  "ingest-x": async (ctx) => {
    seedParties();
    await ingestX(ctx);
  },
  "analyze-posts": async (ctx, params) => {
    await analyzePosts(ctx, { limit: params?.limit ? Number(params.limit) : undefined });
    computeAllScores(ctx.log);
  },
  "check-claims": async (ctx, params) => {
    await checkClaims(ctx, { limit: params?.limit ? Number(params.limit) : undefined });
  },
  "compute-scores": async (ctx) => {
    seedParties();
    computeAllScores(ctx.log);
  },
  synthesize: async (ctx, params) => {
    computeAllScores(ctx.log);
    await synthesizeCoherence(ctx, { partyIds: params?.partyIds as string[] | undefined, themes: params?.themes as string[] | undefined, force: !!params?.force });
  },
  candidats: async (ctx, params) => {
    seedParties();
    await runCandidatesJob(ctx, (params ?? {}) as CandidatesJobParams);
  },
  "candidats-perimetre": async (ctx, params) => {
    seedParties();
    await runCandidatesJob(ctx, { ...((params ?? {}) as CandidatesJobParams), scopeOnly: true, rescope: params?.rescope !== false, list: false });
  },
  "candidats-fiches": async (ctx, params) => {
    const p = (params ?? {}) as CandidatesJobParams;
    if (!p.ids?.length) throw new Error("candidats-fiches exige --ids");
    await runCandidatesJob(ctx, { ...p, list: false });
  },
  veille: async (ctx) => {
    await veilleParlementaire(ctx);
  },
  "candidats-patrimoine": async (ctx) => {
    await auditAssets(ctx);
  },
  "refresh-all": async (ctx) => {
    seedParties();
    await ingestAnDeputes(ctx);
    await ingestAnScrutins(ctx);
    try {
      await ingestSenat(ctx);
    } catch (e) {
      ctx.log(`Sénat ignoré : ${(e as Error).message}`);
    }
    await classifyScrutins(ctx);
    try {
      await ingestAnComptesRendus(ctx);
      await ingestSenatComptesRendus(ctx);
    } catch (e) {
      ctx.log(`Comptes rendus ignorés : ${(e as Error).message}`);
    }
    try {
      await linkDebates(ctx);
    } catch (e) {
      ctx.log(`Débats ignorés : ${(e as Error).message}`);
    }
    try {
      await ingestRss(ctx);
    } catch (e) {
      ctx.log(`RSS ignoré : ${(e as Error).message}`);
    }
    if (xConfigured().connected || xConfigured().bearer) {
      try {
        await ingestX(ctx);
      } catch (e) {
        ctx.log(`X ignoré : ${(e as Error).message}`);
      }
    }
    await analyzePosts(ctx);
    await checkClaims(ctx, { limit: 100 });
    // Un job dédié du même type peut déjà tourner (rattrapage en cours) : on ne traite pas deux fois les mêmes éléments.
    if (isJobRunning("explain-votes")) ctx.log("Explication des votes : un job dédié tourne déjà, étape sautée");
    else await explainVotes(ctx, { limit: 300 });
    computeAllScores(ctx.log);
    await synthesizeCoherence(ctx);
    if (isJobRunning("candidats") || isJobRunning("candidats-fiches")) ctx.log("Candidats : un job dédié tourne déjà, étape sautée");
    else {
      try {
        // Liste revérifiée si elle a plus de 7 jours (nouvelles candidatures, renoncements), puis fiches manquantes.
        await runCandidatesJob(ctx, {});
      } catch (e) {
        ctx.log(`Candidats ignorés : ${(e as Error).message}`);
      }
    }
  },
};

export function launchJob(kind: JobKind, params?: Record<string, unknown>, budgetUsd?: number): { id?: string; error?: string } {
  if (!RUNNERS[kind]) return { error: `Job inconnu : ${kind}` };
  if (isJobRunning(kind)) return { error: `Un job « ${JOB_KINDS[kind].label} » est déjà en cours` };
  const id = startJob(kind, (ctx) => RUNNERS[kind](ctx, params), { budgetUsd });
  return { id };
}
