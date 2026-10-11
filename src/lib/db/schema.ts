import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";

/* ------------------------------------------------------------------ */
/* Référentiels                                                        */
/* ------------------------------------------------------------------ */

export const parties = sqliteTable("parties", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  color: text("color").notNull(),
  family: text("family").notNull(),
  lrIndex: integer("lr_index").notNull(),
  website: text("website"),
  anGroups: text("an_groups", { mode: "json" }).$type<string[]>().notNull(),
  parpolNames: text("parpol_names", { mode: "json" }).$type<string[]>().notNull(),
  senatGroups: text("senat_groups", { mode: "json" }).$type<string[]>().notNull(),
  xHandles: text("x_handles", { mode: "json" }).$type<string[]>().notNull(),
  leaders: text("leaders", { mode: "json" }).$type<string[]>().notNull(),
  notes: text("notes"),
});

export const anGroups = sqliteTable("an_groups", {
  ref: text("ref").primaryKey(), // ex. PO845401
  name: text("name").notNull(),
  abbrev: text("abbrev").notNull(),
  legislature: text("legislature").notNull(),
  dateStart: text("date_start"),
  dateEnd: text("date_end"),
  partyId: text("party_id"),
});

export const politicians = sqliteTable(
  "politicians",
  {
    id: text("id").primaryKey(), // AN: PAxxxx — Sénat: slug NosParlementaires
    chamber: text("chamber").notNull(), // 'AN' | 'SENAT'
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    fullName: text("full_name").notNull(),
    partyId: text("party_id"),
    groupRef: text("group_ref"),
    groupAbbrev: text("group_abbrev"),
    groupName: text("group_name"),
    parpol: text("parpol"),
    department: text("department"),
    circo: text("circo"),
    xHandle: text("x_handle"),
    role: text("role"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    /** Début / fin du mandat parlementaire en cours (ISO) — sert au calcul d'assiduité. */
    mandateStart: text("mandate_start"),
    mandateEnd: text("mandate_end"),
    hatvpUrl: text("hatvp_url"),
    rawJson: text("raw_json"),
  },
  (t) => [index("politicians_party_idx").on(t.partyId), index("politicians_chamber_idx").on(t.chamber)],
);

/* ------------------------------------------------------------------ */
/* Scrutins et votes                                                   */
/* ------------------------------------------------------------------ */

export const scrutins = sqliteTable(
  "scrutins",
  {
    uid: text("uid").primaryKey(), // AN: VTANR5L17Vxxxx — Sénat: SEN-2025-99
    chamber: text("chamber").notNull(),
    number: text("number").notNull(),
    legislature: text("legislature"),
    date: text("date").notNull(), // YYYY-MM-DD
    title: text("title").notNull(),
    objet: text("objet"),
    demandeur: text("demandeur"),
    typeVote: text("type_vote"),
    sort: text("sort"), // adopté / rejeté
    votants: integer("votants"),
    exprimes: integer("exprimes"),
    pour: integer("pour"),
    contre: integer("contre"),
    abstentions: integer("abstentions"),
    url: text("url"),
    dossierRef: text("dossier_ref"),
    ingestedAt: text("ingested_at").notNull(),
  },
  (t) => [index("scrutins_date_idx").on(t.date), index("scrutins_chamber_idx").on(t.chamber)],
);

export const groupVotes = sqliteTable(
  "group_votes",
  {
    scrutinUid: text("scrutin_uid").notNull(),
    groupRef: text("group_ref").notNull(),
    groupAbbrev: text("group_abbrev"),
    partyId: text("party_id"),
    position: text("position"), // pour | contre | abstention | null
    pour: integer("pour").notNull().default(0),
    contre: integer("contre").notNull().default(0),
    abstentions: integer("abstentions").notNull().default(0),
    nonVotants: integer("non_votants").notNull().default(0),
    members: integer("members"),
  },
  (t) => [
    primaryKey({ columns: [t.scrutinUid, t.groupRef] }),
    index("group_votes_party_idx").on(t.partyId),
  ],
);

export const votes = sqliteTable(
  "votes",
  {
    scrutinUid: text("scrutin_uid").notNull(),
    politicianId: text("politician_id").notNull(),
    position: text("position").notNull(), // pour | contre | abstention | nonVotant
    parDelegation: integer("par_delegation", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.scrutinUid, t.politicianId] }),
    index("votes_politician_idx").on(t.politicianId),
  ],
);

export const scrutinAnalyses = sqliteTable(
  "scrutin_analyses",
  {
    scrutinUid: text("scrutin_uid").primaryKey(),
    primaryTheme: text("primary_theme"),
    /** [{ theme, direction: -1|0|1, weight: 0..1 }] — direction = sens d'un vote POUR sur l'axe du thème */
    themes: text("themes", { mode: "json" }).$type<ThemeDirection[]>().notNull(),
    summary: text("summary").notNull(),
    stakes: text("stakes"),
    isProcedural: integer("is_procedural", { mode: "boolean" }).notNull().default(false),
    salience: integer("salience").notNull().default(1), // 1..5
    model: text("model").notNull(),
    analyzedAt: text("analyzed_at").notNull(),
  },
  (t) => [index("scrutin_analyses_theme_idx").on(t.primaryTheme)],
);

export interface ThemeDirection {
  theme: string;
  direction: -1 | 0 | 1;
  weight: number;
}

/**
 * Débat qui précède un scrutin, extrait du compte rendu officiel de la séance
 * (présentation de l'amendement, avis, interventions, explications de vote),
 * puis expliqué en langage courant par le modèle.
 */
export const scrutinDebates = sqliteTable("scrutin_debates", {
  scrutinUid: text("scrutin_uid").primaryKey(),
  source: text("source").notNull(), // an-cri | senat-cri
  crRef: text("cr_ref").notNull(), // uid du compte rendu AN / fichier du jour Sénat
  url: text("url"),
  turns: text("turns", { mode: "json" }).$type<DebateTurn[]>().notNull(),
  hash: text("hash").notNull(),
  extractedAt: text("extracted_at").notNull(),
  explanation: text("explanation", { mode: "json" }).$type<VoteExplanation>(),
  explainModel: text("explain_model"),
  explainedAt: text("explained_at"),
});

export interface DebateTurn {
  speaker: string;
  politicianId: string | null;
  groupRef: string | null;
  group: string | null; // sigle du groupe
  role: "presidence" | "gouvernement" | "commission" | "parlementaire" | "amendement";
  quality: string | null; // « rapporteure de la commission spéciale », « ministre délégué… »
  text: string;
}

export interface VoteExplanation {
  titre?: string;
  enjeu: string;
  siAdopte: string | null;
  piegeQuestion?: string | null;
  piege: string | null;
  argumentsPour: string[];
  argumentsContre: string[];
  groupes: { groupRef: string; raison: string | null; citation: string | null; orateur: string | null; politicianId: string | null }[];
  fiabilite: "bonne" | "partielle" | "faible";
}

/* ------------------------------------------------------------------ */
/* Programmes et documents                                             */
/* ------------------------------------------------------------------ */

export const documents = sqliteTable(
  "documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    partyId: text("party_id").notNull(),
    kind: text("kind").notNull(), // programme | manifeste | communique | manual
    title: text("title").notNull(),
    url: text("url"),
    mime: text("mime"),
    text: text("text"),
    pdfBase64: text("pdf_base64"),
    sha: text("sha"),
    discoveredBy: text("discovered_by"), // 'claude-web-search' | 'manual'
    fetchedAt: text("fetched_at"),
    status: text("status").notNull().default("pending"), // pending | fetched | analyzed | error
    error: text("error"),
  },
  (t) => [index("documents_party_idx").on(t.partyId)],
);

export const documentAnalyses = sqliteTable(
  "document_analyses",
  {
    documentId: integer("document_id").notNull(),
    theme: text("theme").notNull(),
    stance: real("stance"), // -1..1, null si non abordé
    confidence: real("confidence").notNull().default(0),
    summary: text("summary").notNull(),
    measures: text("measures", { mode: "json" }).$type<string[]>().notNull(),
    quotes: text("quotes", { mode: "json" }).$type<string[]>().notNull(),
    model: text("model").notNull(),
    analyzedAt: text("analyzed_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.theme] })],
);

/* ------------------------------------------------------------------ */
/* Prises de parole : interventions en séance, communiqués, messages X  */
/* ------------------------------------------------------------------ */

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(), // tweet id | an-cri:<id_syceron> | senat-cri:<date>:<par> | rss:<hash>
    handle: text("handle").notNull(), // compte X ou nom de l'orateur / du parti
    partyId: text("party_id"),
    politicianId: text("politician_id"),
    /** tweet | qag | explication-vote | discussion-generale | motion | qosd | debat | communique */
    kind: text("kind").notNull().default("tweet"),
    /** Contexte : titre du point de l'ordre du jour, sujet de la question, titre du communiqué. */
    title: text("title"),
    chamber: text("chamber"), // AN | SENAT | null
    sourceRef: text("source_ref"), // uid du compte rendu / URL du flux
    text: text("text").notNull(),
    createdAt: text("created_at").notNull(),
    url: text("url"),
    likes: integer("likes").default(0),
    reposts: integer("reposts").default(0),
    replies: integer("replies").default(0),
    views: integer("views").default(0),
    source: text("source").notNull().default("x-api"), // x-api | import | an-cri | senat-cri | rss
    ingestedAt: text("ingested_at").notNull(),
  },
  (t) => [index("posts_party_idx").on(t.partyId), index("posts_handle_idx").on(t.handle), index("posts_date_idx").on(t.createdAt), index("posts_politician_idx").on(t.politicianId), index("posts_kind_idx").on(t.kind)],
);

export const postAnalyses = sqliteTable("post_analyses", {
  postId: text("post_id").primaryKey(),
  /** [{ theme, stance }] */
  themes: text("themes", { mode: "json" }).$type<{ theme: string; stance: number }[]>().notNull(),
  /** Affirmations vérifiables extraites */
  claims: text("claims", { mode: "json" }).$type<PostClaim[]>().notNull(),
  tone: text("tone"), // factuel | attaque | promesse | émotion | autopromotion
  isPolitical: integer("is_political", { mode: "boolean" }).notNull().default(true),
  model: text("model").notNull(),
  analyzedAt: text("analyzed_at").notNull(),
});

export interface PostClaim {
  claim: string;
  theme: string | null;
  kind: "fait" | "promesse" | "vote-revendique" | "attaque" | "autre";
  checkable: boolean;
}

/* ------------------------------------------------------------------ */
/* Scores calculés et synthèses                                        */
/* ------------------------------------------------------------------ */

export const partyThemeScores = sqliteTable(
  "party_theme_scores",
  {
    partyId: text("party_id").notNull(),
    theme: text("theme").notNull(),
    declaredStance: real("declared_stance"),
    declaredConfidence: real("declared_confidence"),
    votedStance: real("voted_stance"),
    votedN: integer("voted_n").notNull().default(0),
    votedWeight: real("voted_weight").notNull().default(0),
    senatStance: real("senat_stance"),
    senatN: integer("senat_n").notNull().default(0),
    postsStance: real("posts_stance"),
    postsN: integer("posts_n").notNull().default(0),
    gap: real("gap"), // |declared - voted|
    narrative: text("narrative"),
    /** [{ scrutinUid, title, date, position, direction, salience }] */
    evidence: text("evidence", { mode: "json" }).$type<EvidenceItem[]>(),
    verdict: text("verdict"), // coherent | nuance | ecart | contradiction | insuffisant
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.partyId, t.theme] })],
);

export interface EvidenceItem {
  scrutinUid: string;
  title: string;
  date: string;
  position: string;
  direction: number;
  salience: number;
  note?: string;
}

export const politicianThemeScores = sqliteTable(
  "politician_theme_scores",
  {
    politicianId: text("politician_id").notNull(),
    theme: text("theme").notNull(),
    votedStance: real("voted_stance"),
    votedN: integer("voted_n").notNull().default(0),
    postsStance: real("posts_stance"),
    postsN: integer("posts_n").notNull().default(0),
    /** écart avec la ligne du groupe : part des votes divergents */
    dissentRate: real("dissent_rate"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.politicianId, t.theme] })],
);

export const claimChecks = sqliteTable("claim_checks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: text("post_id").notNull(),
  claim: text("claim").notNull(),
  theme: text("theme"),
  verdict: text("verdict").notNull(), // confirme | nuance | contredit | invérifiable
  explanation: text("explanation").notNull(),
  evidence: text("evidence", { mode: "json" }).$type<EvidenceItem[]>().notNull(),
  model: text("model").notNull(),
  checkedAt: text("checked_at").notNull(),
});

/* ------------------------------------------------------------------ */
/* Exploitation                                                        */
/* ------------------------------------------------------------------ */

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  status: text("status").notNull(), // queued | running | done | error | cancelled
  progress: integer("progress").notNull().default(0),
  total: integer("total").notNull().default(0),
  message: text("message"),
  log: text("log").notNull().default(""),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  /** Processus qui exécute le job (serveur ou CLI) : un job n'est « orphelin » que si ce processus est mort. */
  pid: integer("pid"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const usageLog = sqliteTable("usage_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: text("ts").notNull(),
  jobId: text("job_id"),
  task: text("task").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull(),
  costUsd: real("cost_usd").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

/* ------------------------------------------------------------------ */
/* Présidentielle : candidats et fiches biographiques                  */
/* ------------------------------------------------------------------ */

/** Source d'un fait : toujours extérieure au candidat (presse, institution, justice…). */
export interface CandidateSource {
  url: string;
  publisher: string; // nom du média / de l'institution
  date: string | null; // date de publication (ISO ou « 2024-06 ») si connue
  title?: string | null;
}
export interface CandidateFact {
  text: string;
  sources: CandidateSource[]; // au moins une
}
/** Étape d'une procédure judiciaire. */
export type JusticeStage = "plainte" | "enquete" | "garde_a_vue" | "mise_en_examen" | "requisitions" | "non_lieu" | "appel" | "renvoi_proces" | "proces" | "condamnation" | "relaxe" | "classement_sans_suite" | "cassation" | "autre";
/** État actuel d'une affaire, du point de vue de la personne mise en cause. */
export type AffairStatus =
  | "enquete_en_cours"
  | "mise_en_examen"
  | "renvoi_devant_tribunal"
  | "proces_en_cours"
  | "condamnation_non_definitive"
  | "condamnation_definitive"
  | "relaxe_non_definitive"
  | "relaxe_definitive"
  | "non_lieu_non_definitif"
  | "non_lieu_definitif"
  | "classement_sans_suite"
  /** Décision rendue (condamnation, relaxe, non-lieu), mais aucun document officiel n'établit si elle est définitive ou si un recours est en cours. */
  | "decision_finalite_non_etablie"
  | "inconnu";
/** Source d'une étape judiciaire, contrôlée sur le texte de la page (extrait littéral retrouvé). */
export interface JusticeSource extends CandidateSource {
  quote: string; // extrait littéral de la page qui établit l'étape
}
export interface CandidateJusticeStep {
  date: string | null;
  stage: JusticeStage;
  jurisdiction: string | null;
  text: string;
  sources: JusticeSource[];
}
export interface CandidateAffair {
  /** Cause en clair, ex. « Affaire de harcèlement et d'agressions sexuelles présumés ». */
  title: string;
  /** Qualification exacte des faits reprochés, telle qu'établie par les sources. */
  charges: string;
  charges_sources: JusticeSource[];
  current_status: AffairStatus;
  /** État actuel en langage simple, statut d'abord (« Renvoyé devant le tribunal correctionnel de Paris le … »). */
  current_summary: string;
  current_date: string | null;
  current_jurisdiction: string | null;
  /** false : l'état actuel n'est pas confirmé par une source récente vérifiée. */
  current_confirmed: boolean;
  /** Contradiction entre sources sur l'état actuel, le cas échéant. */
  contradiction: string | null;
  steps: CandidateJusticeStep[]; // chronologie, de la plus ancienne à la plus récente
  /** Réaction de la personne rapportée par la presse (« il conteste les faits »), facultative. */
  response: { text: string; sources: CandidateSource[] } | null;
}
export interface CandidateMandate {
  role: string;
  institution: string;
  start: string | null;
  end: string | null; // null = en cours
  sources: CandidateSource[];
}
export interface CandidateSelfVsSources {
  topic: string;
  candidate_says: { text: string; sources: CandidateSource[] };
  sources_show: { text: string; sources: CandidateSource[] };
}
/** Fiche « personnage » : mêmes rubriques, dans le même ordre, pour tous les candidats. */
export interface CandidateProfile {
  summary: CandidateFact;
  identity: CandidateFact[];
  family: CandidateFact[];
  education: CandidateFact[];
  career: CandidateFact[];
  political: CandidateFact[];
  mandates: CandidateMandate[];
  assets: CandidateFact[];
  justice: CandidateAffair[];
  /** Date de la dernière vérification de la rubrique justice (passe dédiée). */
  justice_checked_at?: string;
  positions: CandidateFact[];
  self_vs_sources: CandidateSelfVsSources[];
  /** Points que la recherche n'a pas permis d'établir (transparence). */
  gaps: string[];
}
export interface CandidatePhoto {
  url: string; // vignette upload.wikimedia.org
  fullUrl: string;
  author: string;
  license: string;
  licenseUrl: string | null;
  sourcePage: string; // page du fichier sur Wikimedia Commons
}

export const candidates = sqliteTable(
  "candidates",
  {
    id: text("id").primaryKey(), // slug : prenom-nom
    fullName: text("full_name").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    /** Parti présent dans Cohérence-Politique (table parties), sinon null. */
    partyId: text("party_id"),
    /** Parti / mouvement / soutien tel qu'affiché (ex. « Divers gauche », « sans étiquette »). */
    partyLabel: text("party_label"),
    /** declare | pressenti | officiel (500 parrainages validés par le Conseil constitutionnel) | retire */
    status: text("status").notNull().default("pressenti"),
    /** "job" (recherche web) ou "admin" (posé à la main : le job ne le modifie plus). */
    statusSetBy: text("status_set_by").notNull().default("job"),
    statusSource: text("status_source", { mode: "json" }).$type<CandidateSource | null>(),
    declaredAt: text("declared_at"),
    birthDate: text("birth_date"), // YYYY-MM-DD
    birthPlace: text("birth_place"),
    tagline: text("tagline"), // une ligne factuelle
    wikipediaTitle: text("wikipedia_title"),
    officialSite: text("official_site"), // pour exclure ses propres sites des sources
    photo: text("photo", { mode: "json" }).$type<CandidatePhoto | null>(),
    profile: text("profile", { mode: "json" }).$type<CandidateProfile | null>(),
    profileModel: text("profile_model"),
    profileAt: text("profile_at"),
    /**
     * Périmètre : Cohérence-Politique présente les candidats des partis qui ont au moins un député en exercice.
     * "in" | "out" | null (pas encore vérifié). "out" : masqué des pages, jamais supprimé (réversible).
     */
    scope: text("scope"),
    scopeReason: text("scope_reason"),
    scopeSources: text("scope_sources", { mode: "json" }).$type<CandidateSource[]>(),
    scopeSetBy: text("scope_set_by"), // "job" | "admin"
    scopeCheckedAt: text("scope_checked_at"),
    /** Faits/sources écartés à la validation (sans URL, source non indépendante, lien mort). */
    rejected: text("rejected", { mode: "json" }).$type<string[]>(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("candidates_status_idx").on(t.status)],
);
