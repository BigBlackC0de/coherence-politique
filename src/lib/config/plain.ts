import { THEME_BY_ID } from "./themes";

/**
 * Langage courant : tout ce qui traduit les notions du site en mots simples.
 * Le site s'adresse à tout le monde, pas aux spécialistes : chaque chiffre a sa phrase,
 * chaque mot technique a sa bulle d'explication.
 */

/* ---- Verdicts de cohérence ---- */
export const VERDICT_PLAIN: Record<string, { label: string; short: string; explain: string; tone: "good" | "neutral" | "warn" | "bad" | "muted"; emoji: string }> = {
  coherent: { label: "Fait ce qu'il dit", short: "Cohérent", explain: "Ses votes vont dans le sens de son programme sur ce sujet.", tone: "good", emoji: "✅" },
  nuance: { label: "À peu près", short: "Nuancé", explain: "Ses votes suivent en gros son programme, avec quelques exceptions.", tone: "neutral", emoji: "🤏" },
  ecart: { label: "Pas vraiment", short: "Écart", explain: "Ses votes s'éloignent nettement de ce qu'il promet sur ce sujet.", tone: "warn", emoji: "⚠️" },
  contradiction: { label: "Dit une chose, vote l'inverse", short: "Contradiction", explain: "Ses votes vont à l'opposé de son programme sur ce sujet.", tone: "bad", emoji: "❌" },
  insuffisant: { label: "Pas assez d'infos", short: "Données insuffisantes", explain: "Il manque le programme ou des votes sur ce sujet pour pouvoir comparer.", tone: "muted", emoji: "🤷" },
  confirme: { label: "C'est vrai", short: "Confirmé", explain: "Les votes confirment cette phrase.", tone: "good", emoji: "✅" },
  contredit: { label: "C'est faux", short: "Contredit", explain: "Les votes contredisent cette phrase.", tone: "bad", emoji: "❌" },
  inverifiable: { label: "Impossible à vérifier", short: "Invérifiable", explain: "Aucun vote ne permet de trancher.", tone: "muted", emoji: "🤷" },
};

/* ---- Thèmes en langage courant ---- */
export interface ThemePlain {
  /** La question que le thème pose, pour le commun des mortels. */
  question: string;
  /** Pôle −1 en trois ou quatre mots. */
  left: string;
  /** Pôle +1 en trois ou quatre mots. */
  right: string;
  /** Exemples concrets de ce qu'on y range. */
  examples: string;
}
export const THEME_PLAIN: Record<string, ThemePlain> = {
  "economie-travail": { question: "Plus de protection pour les salariés, ou plus de liberté pour les entreprises ?", left: "protéger les salariés", right: "libérer les entreprises", examples: "SMIC, temps de travail, chômage, usines, prix" },
  "fiscalite-budget": { question: "Plus d'impôts pour financer les services publics, ou moins d'impôts et moins de dépenses ?", left: "plus d'impôts sur les riches, plus de services", right: "moins d'impôts, moins de dépenses", examples: "impôt sur le revenu, impôt sur la fortune (ISF), TVA, dette, budget de l'État" },
  retraites: { question: "Partir plus tôt à la retraite, ou travailler plus longtemps ?", left: "partir plus tôt", right: "travailler plus longtemps", examples: "âge de départ, réforme de 2023, montant des pensions" },
  "sante-social": { question: "Plus de Sécu et d'aides pour tous, ou plus de contrôle et de privé ?", left: "plus de Sécu et d'aides", right: "plus de contrôle, plus de privé", examples: "hôpital, remboursements, revenu de solidarité (RSA), allocations, handicap" },
  immigration: { question: "Accueillir plus largement, ou fermer davantage ?", left: "accueillir et régulariser", right: "limiter et expulser", examples: "titres de séjour, asile, régularisations, expulsions (OQTF), nationalité" },
  "securite-justice": { question: "Prévenir et protéger les libertés, ou punir plus sévèrement ?", left: "prévention et libertés", right: "fermeté et sanctions", examples: "police, prisons, peines, caméras, terrorisme" },
  "societe-laicite": { question: "Plus de libertés individuelles et de nouveaux droits, ou plus de règles communes ?", left: "nouveaux droits, libertés", right: "ordre, traditions, règles", examples: "fin de vie, procréation assistée (PMA), voile, drogues, famille" },
  "europe-international": { question: "Plus d'Europe et de coopération, ou plus de souveraineté nationale ?", left: "plus d'Europe", right: "plus de souveraineté", examples: "Union européenne, OTAN (alliance militaire), Ukraine, commerce, défense" },
  "ecologie-energie": { question: "Agir vite pour le climat quitte à contraindre, ou protéger d'abord l'économie et le confort ?", left: "priorité au climat", right: "priorité à l'économie", examples: "nucléaire, éoliennes, pesticides, voiture, agriculture" },
  "institutions-democratie": { question: "Donner plus de pouvoir aux citoyens et au Parlement, ou garder un exécutif fort ?", left: "plus de pouvoir aux citoyens", right: "exécutif fort, stabilité", examples: "référendum, proportionnelle, 49.3, Sénat, cumul des mandats" },
  "education-culture": { question: "L'école et la culture d'abord publiques et égalitaires, ou plus de liberté de choix et d'exigence ?", left: "école publique, égalité", right: "liberté de choix, mérite", examples: "profs, uniforme, université, audiovisuel public, sport" },
};

export function themePlain(id: string): ThemePlain {
  const t = THEME_BY_ID[id];
  return THEME_PLAIN[id] ?? { question: t?.label ?? id, left: t?.poleLeft.split(",")[0] ?? "−1", right: t?.poleRight.split(",")[0] ?? "+1", examples: t?.scope ?? "" };
}

/* ---- Positions chiffrées → phrases ---- */
export interface StanceWords {
  side: "left" | "right" | "center";
  intensity: "au milieu" | "un peu" | "plutôt" | "nettement" | "très nettement";
  /** Ex. « nettement du côté “moins d’impôts” » */
  text: string;
  /** Ex. « moins d’impôts » */
  pole: string;
}
export function stanceWords(themeId: string, value: number | null | undefined): StanceWords | null {
  if (value === null || value === undefined) return null;
  const p = themePlain(themeId);
  const a = Math.abs(value);
  const intensity: StanceWords["intensity"] = a < 0.1 ? "au milieu" : a < 0.3 ? "un peu" : a < 0.55 ? "plutôt" : a < 0.8 ? "nettement" : "très nettement";
  if (intensity === "au milieu") return { side: "center", intensity, text: "au milieu, sans pencher", pole: "" };
  const side = value < 0 ? "left" : "right";
  const pole = side === "left" ? p.left : p.right;
  return { side, intensity, text: `${intensity} du côté « ${pole} »`, pole };
}

/** Écart déclaré / voté (0 à 2) en mots. */
export function gapWords(gap: number | null | undefined): { label: string; tone: "good" | "warn" | "bad" | "muted" } {
  if (gap === null || gap === undefined) return { label: "pas assez d'infos", tone: "muted" };
  if (gap < 0.3) return { label: "fait ce qu'il dit", tone: "good" };
  if (gap < 0.6) return { label: "à peu près", tone: "warn" };
  return { label: "gros écart", tone: "bad" };
}

/* ---- Types de prises de parole, en mots courants (affichage public) ---- */
export const POST_KIND_PLAIN: Record<string, string> = {
  qag: "Question au gouvernement",
  "explication-vote": "Explication de vote",
  "discussion-generale": "Débat sur un texte",
  motion: "Motion",
  qosd: "Question orale",
  debat: "Débat",
  communique: "Communiqué",
  tweet: "Message X",
};

/* ---- Glossaire : les bulles « c'est quoi ? » ----
 * Règles : titre de 1 à 4 mots ; 1 ou 2 phrases courtes (25 mots environ) ; pas de sigle
 * sans explication ; un exemple concret quand il aide.
 */
export const GLOSSARY: Record<string, { title: string; text: string }> = {
  scrutin: { title: "Vote nom par nom", text: "Un vote où l'on note le choix de chaque élu. Les autres votes se font à main levée, sans trace de qui a voté quoi." },
  "position-declaree": { title: "Ce que le parti dit", text: "Sa position d'après son programme et ses textes officiels. Par exemple : « baisser l'âge de départ à la retraite »." },
  "position-votee": { title: "Ce que le parti vote", text: "Sa position d'après les votes de ses élus. Un vote final sur une loi compte plus qu'un vote sur un détail." },
  ecart: { title: "L'écart", text: "La distance entre ce que le parti dit et ce qu'il vote, de 0 (pareil) à 2 (l'inverse). Un écart n'est pas forcément un mensonge." },
  verdict: { title: "Le verdict", text: "La réponse en quelques mots : sur ce sujet, le parti fait-il ce qu'il dit ? Les votes utilisés sont toujours cités." },
  abstention: { title: "Abstention", text: "L'élu est là, mais ne vote ni pour ni contre." },
  "non-votant": { title: "Non votant", text: "L'élu est noté dans le vote, mais ne vote pas. C'est le cas, par exemple, de la personne qui préside la séance." },
  groupe: { title: "Groupe parlementaire", text: "Les élus d'un même parti, ou de partis proches, siègent ensemble. Le choix du groupe, c'est ce qu'a voté la majorité de ses membres." },
  "motion-censure": { title: "Motion de censure", text: "Un vote pour renverser le gouvernement. Si la majorité des députés la vote, le gouvernement doit démissionner." },
  "49-3": { title: "Le 49.3", text: "Un article de la Constitution. Il permet au gouvernement de faire adopter un texte sans vote, sauf si une motion de censure le renverse." },
  amendement: { title: "Amendement", text: "Une proposition pour changer un texte de loi : ajouter, retirer ou modifier une phrase. Chaque amendement est voté à part." },
  importance: { title: "Importance d'un vote", text: "Une note de 1 à 5. Le 5 va aux grands votes, comme le budget ; le 1 aux détails techniques. Les votes importants comptent plus." },
  presence: { title: "Présence", text: "La part des votes nom par nom où l'élu était là, depuis le début de son mandat." },
  boussole: { title: "La boussole", text: "Une carte des partis : l'économie de gauche à droite, la société de bas en haut. Rond vide = ce qu'il dit, rond plein = ce qu'il vote." },
  programme: { title: "Programme", text: "Le document où un parti écrit ce qu'il veut faire s'il gouverne. On lit ceux des élections récentes et à venir." },
  "prise-de-parole": { title: "Prise de parole", text: "Ce qu'un élu dit au Parlement (question à un ministre, débat…), ou un communiqué du parti. Cité mot pour mot." },
  qag: { title: "Question au gouvernement", text: "Chaque semaine, des députés et des sénateurs interrogent les ministres en direct. Des questions courtes et très politiques." },
  "explication-vote": { title: "Explication de vote", text: "Juste avant un grand vote, un élu par groupe dit pourquoi son groupe vote pour ou contre." },
  salience: { title: "Vote important", text: "Un vote noté 4 ou 5 sur 5 en importance : une loi entière, le budget, une motion de censure…" },
  "senat-presence": { title: "Et au Sénat ?", text: "Au Sénat, un élu peut voter à la place d'un collègue absent. On ne sait donc pas qui était là : on montre seulement les votes." },
};

/* ---- Écarts programme / votes / discours, en phrases ---- */
export type AlignSource = "programme" | "votes" | "discours";
export const SOURCE_LABEL: Record<AlignSource, string> = { programme: "Programme", votes: "Votes", discours: "Discours" };

/** Repères minimaux pour fabriquer une phrase (stance null = repère pas assez fiable). */
export interface AlignStances {
  programme: number | null;
  votes: number | null;
  discours: number | null;
  /** Les deux repères les plus éloignés (le premier est celui qu'on cite d'abord). */
  pair: [AlignSource, AlignSource] | null;
}

function clause(themeId: string, src: AlignSource, v: number, partyName: string | null): string {
  const w = stanceWords(themeId, v)!;
  const where = w.side === "center" ? "au milieu, sans pencher" : w.text;
  if (src === "discours") return partyName ? `Dans ses prises de parole, ${partyName} va ${where}` : `ses prises de parole vont ${where}`;
  if (src === "votes") return partyName ? `Les votes de ${partyName} vont ${where}` : `ses votes vont ${where}`;
  return partyName ? `Le programme de ${partyName} va ${where}` : `son programme va ${where}`;
}

/** Libellé de la pastille d'alerte, selon les deux repères qui s'éloignent. */
export function ecartBadge(pair: [AlignSource, AlignSource] | null): string {
  if (!pair) return "";
  return pair.includes("votes") ? "Ils ne disent pas la même chose qu'ils votent" : "Programme et discours ne disent pas la même chose";
}

/**
 * Phrase simple, fabriquée par le code (pas par le modèle), qui décrit l'écart.
 * Ex. « Dans ses prises de parole, LR va plutôt du côté « protéger les salariés » ;
 * ses votes vont nettement du côté « libérer les entreprises », et son programme aussi. »
 */
export function ecartSentence(themeId: string, partyName: string, a: AlignStances): string {
  if (!a.pair) return "";
  // On cite d'abord le discours, puis le programme, puis les votes : les votes servent de point de comparaison.
  const order: AlignSource[] = ["discours", "programme", "votes"];
  const [x, y] = [...a.pair].sort((p, q) => order.indexOf(p) - order.indexOf(q)) as [AlignSource, AlignSource];
  const third = (["programme", "votes", "discours"] as AlignSource[]).find((s) => s !== x && s !== y && a[s] !== null);
  const vx = a[x]!;
  const vy = a[y]!;
  let s = `${clause(themeId, x, vx, partyName)} ; ${clause(themeId, y, vy, null)}`;
  if (third) {
    const vt = a[third]!;
    const same = stanceWords(themeId, vt)!.text === stanceWords(themeId, vy)!.text;
    const name = third === "votes" ? "ses votes" : third === "programme" ? "son programme" : "ses prises de parole";
    if (same) s += `, et ${name} aussi`;
    else s += `, et ${clause(themeId, third, vt, null).replace(/^(ses votes|son programme|ses prises de parole) (vont|va) /, `${name} `)}`;
  }
  return `${s}.`;
}

/**
 * Phrase clé, courte, pour le titre d'une carte d'écart : « Écrit « X » mais vote « Y ». »
 * Seuls les pôles sont cités (pas l'intensité) : le graphique montre la distance.
 */
export function ecartHeadline(themeId: string, a: AlignStances): string {
  if (!a.pair) return "";
  const order: AlignSource[] = ["programme", "discours", "votes"];
  const [x, y] = [...a.pair].sort((p, q) => order.indexOf(p) - order.indexOf(q)) as [AlignSource, AlignSource];
  const part = (src: AlignSource, v: number) => {
    const w = stanceWords(themeId, v)!;
    const center = w.side === "center";
    if (src === "programme") return center ? "a un programme au milieu" : `écrit « ${w.pole} »`;
    if (src === "discours") return center ? "parle au milieu en séance" : `dit en séance « ${w.pole} »`;
    return center ? "vote au milieu" : `vote « ${w.pole} »`;
  };
  const s = `${part(x, a[x]!)} mais ${part(y, a[y]!)}.`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Libellé court de la pastille d'écart : « Écart programme / votes ». */
export function ecartTag(pair: [AlignSource, AlignSource] | null): string {
  if (!pair) return "Écart";
  const order: AlignSource[] = ["programme", "discours", "votes"];
  const [x, y] = [...pair].sort((p, q) => order.indexOf(p) - order.indexOf(q));
  return `Écart ${SOURCE_LABEL[x].toLowerCase()} / ${SOURCE_LABEL[y].toLowerCase()}`;
}

/** Rappel de neutralité, affiché une fois par page à côté des écarts. */
export const ECART_CAVEAT = "Un écart n'est pas forcément une incohérence : être dans l'opposition, voter un compromis ou parler selon l'actualité peut l'expliquer. Les preuves sont là pour que chacun juge.";
