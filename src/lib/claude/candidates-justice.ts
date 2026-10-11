import { extractText, getDocumentProxy } from "unpdf";
import type { AffairStatus, CandidateAffair, CandidateJusticeStep, CandidateSource, JusticeSource, JusticeStage } from "../db/schema";
import { llm } from "../llm";
import { CandidateJusticeOutput, JusticeVerificationOutput, type CandidateJusticeOutputT } from "./schemas";
import type { JobContext } from "../jobs";

/**
 * Rubrique « Affaires judiciaires » : passe dédiée, la plus exigeante de la fiche (risque de diffamation).
 *
 *  1. Recherche web spécifique : chronologie complète de chaque affaire, plusieurs sources par étape,
 *     sources officielles en priorité (décisions publiées, parquet, Cour de cassation), sinon presse nationale.
 *  2. Mise en forme structurée (affaires → étapes → sources).
 *  3. Récupération du TEXTE de chaque source (HTTP, HTML ou PDF), puis vérification par un second appel au modèle,
 *     sans accès web, qui doit citer pour chaque étape un extrait LITTÉRAL de la source.
 *  4. Contrôle programmatique : l'extrait cité doit figurer réellement dans le texte récupéré ; sinon la source est
 *     rejetée. Une étape sans source vérifiée est retirée ; une affaire sans étape vérifiée est retirée.
 *     L'état actuel doit reposer sur une étape vérifiée de la nature correspondante, sinon « inconnu ».
 *     Si la dernière étape vérifiée a plus d'un an et que l'affaire n'est pas close, l'état actuel est marqué
 *     « non confirmé par une source récente ».
 *  Wikipédia, le site de la personne, de son parti et ses réseaux ne sont jamais retenus ici.
 */

/**
 * Sources OFFICIELLES pour la justice : institutions seulement (juridictions, parquets, ministère, Conseil constitutionnel,
 * Conseil d'État, Cour de cassation, Légifrance, assemblées, juridictions européennes). La presse ne suffit jamais :
 * chaque étape affichée doit être établie, mot pour mot, par au moins une de ces sources, et seules ces sources sont affichées.
 */
const OFFICIAL_JUSTICE_DOMAINS = [
  "justice.fr", // tribunaux judiciaires, cours d'appel, ministère (justice.gouv.fr), parquets
  "justice.gouv.fr",
  "courdecassation.fr",
  "conseil-constitutionnel.fr",
  "conseil-etat.fr",
  "legifrance.gouv.fr",
  "service-public.fr",
  "assemblee-nationale.fr",
  "senat.fr",
  "elysee.fr",
  "echr.coe.int",
  "hudoc.echr.coe.int",
  "curia.europa.eu",
  "eppo.europa.eu",
  "cnccfp.fr",
  "hatvp.fr",
];
const isOfficial = (url: string) => {
  const h = host(url);
  return !!h && OFFICIAL_JUSTICE_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
};
/** Étapes qui constituent un acte de la justice visant la personne (une simple plainte d'un tiers ne suffit pas). */
const JUDICIAL_ACTS: JusticeStage[] = ["enquete", "garde_a_vue", "mise_en_examen", "requisitions", "non_lieu", "appel", "renvoi_proces", "proces", "condamnation", "relaxe", "classement_sans_suite", "cassation"];

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MAX_SOURCE_CHARS = 7000;

const host = (u: string): string | null => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* Récupération du texte des sources                                   */
/* ------------------------------------------------------------------ */

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#0?39;|&rsquo;|&#8217;|&apos;/g, "'")
    .replace(/&laquo;|&#171;/g, "«")
    .replace(/&raquo;|&#187;/g, "»")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à")
    .replace(/&ecirc;/g, "ê")
    .replace(/&ccedil;/g, "ç")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

const textCache = new Map<string, string | null>();
export async function fetchSourceText(url: string): Promise<string | null> {
  if (textCache.has(url)) return textCache.get(url)!;
  let out: string | null = null;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": BROWSER_UA, accept: "text/html,application/pdf,application/xhtml+xml,*/*;q=0.8", "accept-language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(25000),
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get("content-type") ?? "";
      if (mime.includes("pdf") || buf.subarray(0, 5).toString() === "%PDF-") {
        const pdf = await getDocumentProxy(new Uint8Array(buf));
        const { text } = await extractText(pdf, { mergePages: true });
        out = String(text).replace(/\s+/g, " ").trim();
      } else {
        out = htmlToText(buf.toString("utf8"));
      }
      if (out.length < 200) out = null;
    }
  } catch {
    out = null;
  }
  textCache.set(url, out);
  return out;
}

/** Normalisation pour comparer un extrait cité au texte de la page. */
export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/[«»“”"]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

/** Normalise pour comparer des nombres : sans accents ni casse, séparateurs de milliers par espace retirés (« 1 234 567 » → « 1234567 »). */
export const squash = (s: string) => {
  let t = norm(s);
  for (let i = 0; i < 3; i++) t = t.replace(/(\d) (?=\d{3}(?!\d))/g, "$1");
  return t;
};

/**
 * Applique la règle « source officielle seulement » à une affaire déjà enregistrée (fiches vérifiées avant cette règle,
 * où une source de presse reconnue suffisait). Retire les sources non officielles, puis les étapes sans source, puis
 * l'affaire entière si aucune étape ne subsiste ou si aucun acte de la justice n'est établi. `null` = affaire retirée.
 */
export function enforceOfficial(a: CandidateAffair): CandidateAffair | null {
  const steps = a.steps.map((s) => ({ ...s, sources: s.sources.filter((x) => isOfficial(x.url)) })).filter((s) => s.sources.length > 0);
  if (!steps.length || !steps.some((s) => JUDICIAL_ACTS.includes(s.stage))) return null;
  const chargesSrc = a.charges_sources.filter((x) => isOfficial(x.url));
  const changed = steps.length !== a.steps.length || chargesSrc.length !== a.charges_sources.length;
  if (!changed && steps.every((s, i) => s.sources.length === a.steps[i].sources.length)) return a;
  let status = a.current_status;
  if (status !== "inconnu" && !steps.some((s) => STATUS_NEEDS[status].includes(s.stage))) status = "inconnu";
  return {
    ...a,
    steps,
    charges: chargesSrc.length ? a.charges : "Qualification exacte non confirmée par les sources vérifiées",
    charges_sources: chargesSrc,
    current_status: status,
    current_confirmed: status === "inconnu" ? false : a.current_confirmed,
    // La contradiction et le résumé d'origine reposaient aussi sur des sources non officielles : le résumé est reconstruit par sanitizeAffair.
    contradiction: null,
    current_summary: status === "inconnu" ? `État actuel non établi par les sources officielles vérifiées. Dernière étape vérifiée : ${steps[steps.length - 1].text}` : a.current_summary,
  };
}

/** Tournures qui trahissent un fait rapporté par la presse plutôt qu'établi par le document cité. */
const PRESS_HEDGE = /selon (la |le |les )?(presse|m[ée]dias?|afp|le monde|le figaro|lib[ée]ration|franceinfo|publicsenat|lcp)|d['’]apr[èe]s (la |le |les )?(presse|m[ée]dias?)|rapporte (la |le )?presse|\bsemble\b|\bserait\b|\bseraient\b/i;

/**
 * Dernier garde-fou, appliqué à chaque étape déjà « vérifiée » : le texte affiché ne doit contenir aucun chiffre absent
 * du ou des documents officiels cités, ni tournure de presse. Sinon il est remplacé par l'extrait littéral du document.
 * Le résumé de l'état actuel est reconstruit à partir de la seule dernière étape ainsi garantie.
 */
export async function sanitizeAffair(a: CandidateAffair): Promise<CandidateAffair> {
  const steps: CandidateJusticeStep[] = [];
  for (const s of a.steps) {
    const texts = await Promise.all(s.sources.map((x) => fetchSourceText(x.url)));
    const hay = squash(texts.filter((t): t is string => !!t).join(" "));
    const nums = (squash(s.text).match(/\d+(?:[.,]\d+)?/g) ?? []).filter((n) => n.replace(/\D/g, "").length >= 2);
    const missing = nums.filter((n) => !hay.includes(n));
    if (!missing.length && !PRESS_HEDGE.test(s.text)) {
      steps.push(s);
      continue;
    }
    const src = s.sources.find((x) => x.quote) ?? s.sources[0];
    steps.push({ ...s, text: src?.quote ? `Selon le document officiel (${src.publisher}) : « ${src.quote} »` : s.text });
  }
  if (!steps.length) return a;
  const last = steps[steps.length - 1];
  // « Définitive » ou « non définitive » sont des qualifications juridiques : il faut qu'un document officiel établisse le recours
  // (appel, pourvoi) après la décision, ou le rejet du pourvoi. À défaut, on dit seulement qu'une décision a été rendue.
  let status = a.current_status;
  const family = status.startsWith("condamnation") ? "condamnation" : status.startsWith("relaxe") ? "relaxe" : status.startsWith("non_lieu") ? "non_lieu" : null;
  if (family) {
    const decision = [...steps].reverse().find((s) => s.stage === family);
    const after = decision ? steps.filter((s) => (s.stage === "appel" || s.stage === "cassation") && dateGte(s.date, decision.date)) : [];
    const definitive = status.endsWith("_definitive") || status.endsWith("_definitif");
    const established = definitive ? after.some((s) => s.stage === "cassation") : after.length > 0;
    if (!established) status = "decision_finalite_non_etablie";
  }
  const summary =
    status === "inconnu"
      ? a.current_summary
      : `Dernier acte établi par un document officiel (${last.date ?? "date non précisée"}, ${last.jurisdiction ?? "juridiction non précisée"}) : ${last.text}`;
  return { ...a, steps, current_status: status, current_summary: summary, current_date: last.date ?? a.current_date, current_jurisdiction: last.jurisdiction ?? a.current_jurisdiction };
}

/** `a >= b` pour des dates ISO de précisions différentes (« 2026-07 » vs « 2026-07-07 ») ; inconnue = faux. */
function dateGte(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const n = Math.min(a.length, b.length, 10);
  return a.slice(0, n) >= b.slice(0, n);
}

/** L'extrait figure-t-il dans le texte ? Littéralement (après normalisation), ou au moins un long segment (≥ 60 car.). */
export function quoteFound(quote: string, text: string): boolean {
  const q = norm(quote).replace(/^\W+|\W+$/g, "");
  if (q.length < 15) return false;
  const t = norm(text);
  if (t.includes(q)) return true;
  // Extraits recollés par le modèle avec « … » : chaque morceau long doit figurer.
  const parts = q.split(/\.\.\.|…|\[\.\.\.\]/).map((p) => p.trim()).filter((p) => p.length >= 25);
  if (parts.length > 1 && parts.every((p) => t.includes(p))) return true;
  if (q.length >= 80) {
    for (let i = 0; i + 60 <= q.length; i += 20) if (t.includes(q.slice(i, i + 60))) return true;
  }
  return false;
}

const JUSTICE_WORDS = /mis(e)? en examen|non-lieu|non lieu|renvoy|condamn|relax|acquitt|tribunal|cour d'appel|cour de cassation|chambre de l'instruction|parquet|plainte|enqu[eê]te|garde à vue|proc[eè]s|appel|cassation|juge|r[ée]quisitions|harc[eè]lement|agression|d[ée]tournement|fraude|abus|corruption|prise ill[ée]gale|diffamation|injure|provocation|financement|emploi fictif|escroquerie/i;

/** Extraits utiles d'une page : fenêtres autour du nom de la personne et des termes judiciaires. */
function excerpt(text: string, lastName: string): string {
  if (text.length <= MAX_SOURCE_CHARS) return text;
  const name = norm(lastName);
  const lines = text.split(/\n+/);
  const keep: string[] = [];
  let size = 0;
  for (let i = 0; i < lines.length && size < MAX_SOURCE_CHARS; i++) {
    const l = lines[i];
    if (norm(l).includes(name) || JUSTICE_WORDS.test(l)) {
      const chunk = [lines[i - 1], l, lines[i + 1]].filter(Boolean).join("\n");
      keep.push(chunk.slice(0, 1500));
      size += Math.min(chunk.length, 1500);
      i++;
    }
  }
  return keep.length ? keep.join("\n[…]\n").slice(0, MAX_SOURCE_CHARS) : text.slice(0, MAX_SOURCE_CHARS);
}

/* ------------------------------------------------------------------ */
/* Recherche, mise en forme, vérification                              */
/* ------------------------------------------------------------------ */

const STATUS_NEEDS: Record<AffairStatus, JusticeStage[]> = {
  enquete_en_cours: ["enquete", "plainte", "garde_a_vue", "requisitions"],
  mise_en_examen: ["mise_en_examen"],
  renvoi_devant_tribunal: ["renvoi_proces"],
  proces_en_cours: ["proces", "renvoi_proces"],
  condamnation_non_definitive: ["condamnation"],
  condamnation_definitive: ["condamnation", "cassation"],
  relaxe_non_definitive: ["relaxe"],
  relaxe_definitive: ["relaxe", "cassation"],
  non_lieu_non_definitif: ["non_lieu"],
  non_lieu_definitif: ["non_lieu"],
  classement_sans_suite: ["classement_sans_suite"],
  decision_finalite_non_etablie: ["condamnation", "relaxe", "non_lieu"],
  inconnu: [],
};
/** Ordre logique des étapes, pour départager deux étapes de même mois. */
const STAGE_RANK: Record<JusticeStage, number> = { plainte: 0, enquete: 1, garde_a_vue: 2, mise_en_examen: 3, requisitions: 4, non_lieu: 5, classement_sans_suite: 5, renvoi_proces: 5, autre: 5, proces: 6, condamnation: 7, relaxe: 7, appel: 8, cassation: 9 };
const CLOSED: AffairStatus[] = ["condamnation_definitive", "relaxe_definitive", "non_lieu_definitif", "classement_sans_suite"];

const toDate = (d: string | null | undefined): number | null => {
  if (!d) return null;
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(d);
  return m ? Date.UTC(Number(m[1]), Number(m[2] ?? 1) - 1, Number(m[3] ?? 1)) : null;
};

export interface JusticeResult {
  affairs: CandidateAffair[];
  rejected: string[];
  note: string;
  /**
   * Nombre d'affaires trouvées par la recherche avant vérification. Si > 0 alors que `affairs` est vide, la rubrique ne
   * doit PAS être présentée comme « aucune procédure » : on n'a simplement rien pu établir par une source officielle.
   */
  proposed: number;
}

export async function buildJustice(ctx: JobContext, c: { fullName: string; lastName: string; partyLabel: string | null }, blocked: string[], system: string): Promise<JusticeResult> {
  const today = new Date().toISOString().slice(0, 10);
  const rejected: string[] = [];

  // 1. Recherche dédiée.
  const research = await llm({
    task: "candidats-justice-recherche",
    system,
    prompt: `Nous sommes le ${today}. Recherche, avec la plus grande rigueur, les affaires judiciaires visant PERSONNELLEMENT ${c.fullName} (${c.partyLabel ?? "sans étiquette"}), personnalité politique française — en tant que personne mise en cause (pas comme plaignant, témoin ou victime).
Pour CHAQUE affaire :
- la qualification pénale EXACTE des faits reprochés (telle qu'écrite par la justice ou la presse : « détournement de fonds publics », « harcèlement sexuel », etc.) ;
- la chronologie COMPLÈTE et datée : plainte, enquête, garde à vue, mise en examen, réquisitions, non-lieu, appel, renvoi devant un tribunal, procès, jugement, condamnation (peine), relaxe, pourvoi en cassation… avec la juridiction de chaque étape ;
- l'ÉTAT ACTUEL le plus récent (cherche explicitement les nouvelles de ${new Date().getFullYear()} et ${new Date().getFullYear() - 1}) : précise si une décision est définitive ou susceptible d'appel/pourvoi ;
- pour chaque étape, une SOURCE OFFICIELLE, et elle seule compte : décision ou communiqué publié par la juridiction (sites *.justice.fr : tribunal judiciaire, cour d'appel, parquet, parquet national financier ; justice.gouv.fr), décision de la Cour de cassation (courdecassation.fr, Judilibre), du Conseil constitutionnel (conseil-constitutionnel.fr), du Conseil d'État, texte sur legifrance.gouv.fr, décision de la CEDH. Cherche activement le texte officiel de chaque décision (communiqué de la cour d'appel ou du tribunal, arrêt, décision du Conseil constitutionnel). Donne l'URL EXACTE de chaque document officiel consulté et sa date, et ouvre-les (WebFetch) pour vérifier qu'ils disent bien ce que tu leur attribues. IMPORTANT : si pour une étape tu ne trouves aucun document officiel, ne la supprime pas du dossier : décris-la quand même avec les articles de presse qui la rapportent (URL et date), en la marquant « SANS SOURCE OFFICIELLE ». Elle ne sera pas publiée, mais l'existence de l'affaire doit rester connue du dossier pour ne jamais conclure à tort qu'il n'y en a pas.
- si des sources se contredisent sur l'état actuel, signale-le.
N'utilise ni Wikipédia, ni le site de la personne ou de son parti, ni les réseaux sociaux. N'inclus ni rumeur, ni accusation sans procédure judiciaire, ni procédure où la personne n'est que plaignante, ni plainte déposée contre elle qui n'a donné lieu à aucun acte de la justice la visant (ouverture d'enquête la visant, garde à vue, mise en examen, renvoi, jugement…). Aucun adjectif.
Si tu ne trouves aucune affaire, dis-le explicitement.
MÉTHODE (tu disposes d'un nombre limité de tours) : 1) quelques recherches pour identifier les affaires et leur état le plus récent ; 2) ouvre au plus une douzaine de documents officiels, les plus décisifs ; 3) RÉDIGE ENSUITE le dossier complet dans ta réponse finale. Ne termine jamais par une annonce de ce que tu vas faire : ta réponse finale EST le dossier (affaires, étapes datées, URL).`,
    tools: ["web"],
    model: "main",
    effort: "high",
    maxTurns: 60,
    ctx,
  });
  // Une recherche interrompue (tours épuisés, quota, refus) ne produit qu'un dossier partiel, voire une simple phrase
  // d'annonce : on ne s'en sert jamais, sous peine de conclure « aucune affaire » sur une recherche inachevée.
  if (research.error) throw new Error(`recherche judiciaire interrompue : ${research.error}`);
  if (!research.text) throw new Error("recherche judiciaire vide");
  ctx.log(`${c.fullName} : dossier de recherche judiciaire — ${research.text.length} caractères. Début : ${research.text.replace(/\s+/g, " ").slice(0, 700)}`);

  // 2. Mise en forme.
  const structured = await llm({
    task: "candidats-justice-fiche",
    system,
    prompt: `Mets en forme les affaires judiciaires visant personnellement ${c.fullName} à partir UNIQUEMENT du dossier fourni. N'écarte AUCUNE affaire ni AUCUNE étape du dossier, même marquée « sans source officielle » : reprends-les avec les URL données (le tri des sources se fait ensuite, automatiquement). Reprends les URL exactes. Une étape = un acte de procédure daté. Titre de l'affaire : la cause en clair (« Affaire de … présumé(e)s »), sans jugement. Qualification : mot pour mot telle que dans les sources. Si le dossier ne contient aucune affaire, renvoie un tableau vide.`,
    textDoc: { title: `Dossier judiciaire — ${c.fullName}`, text: research.text },
    schema: CandidateJusticeOutput,
    model: "main",
    effort: "medium",
    ctx,
  });
  if (!structured.output) throw new Error(`mise en forme judiciaire impossible (${structured.error ?? "?"})`);
  const draft: CandidateJusticeOutputT = structured.output;
  if (!draft.affairs.length) return { affairs: [], rejected, note: draft.not_found_note, proposed: 0 };

  // 3. Sources : filtrage (indépendance) puis récupération du texte.
  const sourceIndex = new Map<string, number>();
  const sources: { src: CandidateSource; text: string | null }[] = [];
  const admissible = (s: CandidateSource, label: string): boolean => {
    const h = /^https?:\/\//.test(s.url) ? host(s.url) : null;
    if (!h) return (rejected.push(`${label} — source sans URL (${s.publisher})`), false);
    if (h.endsWith("wikipedia.org")) return (rejected.push(`${label} — Wikipédia non retenue pour la justice`), false);
    if (blocked.some((d) => h === d || h.endsWith(`.${d}`))) return (rejected.push(`${label} — source non indépendante : ${s.url}`), false);
    return true;
  };
  const register = (s: CandidateSource): number => {
    const url = s.url.trim();
    if (!sourceIndex.has(url)) {
      sourceIndex.set(url, sources.length);
      sources.push({ src: { url, publisher: s.publisher, date: s.date, title: s.title ?? null }, text: null });
    }
    return sourceIndex.get(url)!;
  };
  const plan = draft.affairs.map((a) => ({
    a,
    charges: a.charges_sources.filter((s) => admissible(s, `Qualification « ${a.title} »`)).map(register),
    steps: a.steps.map((st) => ({ st, srcs: st.sources.filter((s) => admissible(s, `Étape « ${st.text.slice(0, 60)} »`)).map(register) })),
  }));
  ctx.log(`${c.fullName} : justice — ${draft.affairs.length} affaire(s), ${sources.length} source(s) à relire`);
  for (const s of sources) s.text = await fetchSourceText(s.src.url);
  const unreadable = sources.filter((s) => !s.text);
  for (const s of unreadable) rejected.push(`Justice — page illisible (accès refusé, payante ou introuvable), non vérifiable : ${s.src.url}`);

  // 4. Vérification par le modèle, sur les textes récupérés uniquement.
  const sourcesBlock = sources
    .map((s, i) => `[S${i}] ${s.src.publisher}${s.src.date ? ` (${s.src.date})` : ""} — ${s.src.url}\n${s.text ? excerpt(s.text, c.lastName) : "[TEXTE INDISPONIBLE : ne peut rien établir]"}`)
    .join("\n\n=====\n\n");
  const claims = plan
    .map(
      (p, ai) =>
        `[A${ai}] ${p.a.title}\n  Qualification : ${p.a.charges} — sources : ${p.charges.map((i) => `S${i}`).join(", ") || "aucune"}\n` +
        p.steps.map((s, si) => `  [E${si}] ${s.st.date ?? "date ?"} · ${s.st.stage} · ${s.st.jurisdiction ?? "?"} : ${s.st.text} — sources : ${s.srcs.map((i) => `S${i}`).join(", ") || "aucune"}`).join("\n"),
    )
    .join("\n\n");
  const verif = await llm({
    task: "candidats-justice-verification",
    system: "Tu es vérificateur juridique pour une rédaction française. Tu confrontes des affirmations au TEXTE des sources fourni, et à rien d'autre (ni mémoire, ni web). Tu es strict : une étape n'est confirmée par une source que si son texte l'établit explicitement pour cette personne. Tu cites des extraits mot pour mot.",
    prompt: `Personne concernée : ${c.fullName}. Date du jour : ${today}.

AFFIRMATIONS À VÉRIFIER :
${claims}

Pour chaque affaire [A…] :
- charges_check : pour chaque source de la qualification, la source mentionne-t-elle bien ces faits reprochés à ${c.fullName} ? Extrait littéral.
- steps : pour chaque étape [E…] et chacune de ses sources [S…], le texte de la source établit-il cette étape (nature, personne, date compatible) ? Extrait LITTÉRAL copié du texte (pas de reformulation), vide si non.
- current_status : l'état actuel, déduit seulement des étapes que tu as confirmées ; « inconnu » si les sources confirmées ne permettent pas de le dire. Une décision n'est « définitive » que si une source confirmée l'indique (absence d'appel, rejet du pourvoi…).
- current_summary : statut d'abord, en langage simple, daté, juridiction comprise, en rappelant brièvement le chemin (ex. non-lieu puis annulation en appel).
- contradiction : si deux sources confirmées se contredisent sur l'état actuel.

TEXTES DES SOURCES :
${sourcesBlock}`,
    schema: JusticeVerificationOutput,
    model: "main",
    effort: "high",
    maxTokens: 24000,
    ctx,
  });
  if (!verif.output) throw new Error(`vérification judiciaire impossible (${verif.error ?? "?"})`);

  // 5. Contrôle programmatique des extraits et assemblage.
  const affairs: CandidateAffair[] = [];
  plan.forEach((p, ai) => {
    const v = verif.output!.affairs.find((x) => x.index === ai);
    const check = (si: number, quote: string, supported: boolean, label: string): JusticeSource | null => {
      const s = sources[si];
      if (!s || !supported) return null;
      if (!s.text || !quoteFound(quote, s.text)) {
        rejected.push(`${label} — extrait introuvable dans ${s?.src.url ?? `S${si}`}`);
        return null;
      }
      return { ...s.src, quote: quote.trim().slice(0, 400) };
    };
    const steps: CandidateJusticeStep[] = [];
    p.steps.forEach((ps, si) => {
      const vs = v?.steps.find((x) => x.step === si);
      const label = `${p.a.title} / ${ps.st.text.slice(0, 70)}`;
      const ok = (vs?.checks ?? [])
        .filter((ch) => ps.srcs.includes(ch.source))
        .map((ch) => check(ch.source, ch.quote, ch.supported, label))
        .filter((x): x is JusticeSource => !!x);
      const uniq = ok.filter((s, i) => ok.findIndex((o) => o.url === s.url) === i);
      if (!uniq.length) {
        rejected.push(`Étape retirée (aucune source ne l'établit) : ${label}`);
        return;
      }
      // Règle : source officielle uniquement. Une étape établie seulement par la presse n'est pas publiée.
      const official = uniq.filter((x) => isOfficial(x.url));
      if (!official.length) {
        rejected.push(`Étape retirée (aucune source officielle ; sources lues : ${uniq.map((x) => host(x.url)).join(", ")}) : ${label}`);
        return;
      }
      steps.push({ date: ps.st.date, stage: ps.st.stage, jurisdiction: ps.st.jurisdiction, text: ps.st.text, sources: official });
    });
    if (!steps.length) {
      rejected.push(`Affaire retirée (aucune étape vérifiée) : ${p.a.title}`);
      return;
    }
    if (!steps.some((x) => JUDICIAL_ACTS.includes(x.stage))) {
      rejected.push(`Affaire retirée (plainte ou démarche sans acte de la justice établi visant la personne) : ${p.a.title}`);
      return;
    }
    // Tri chronologique à la précision commune (« 2024-12 » vs « 2024-12-06 » : ordre d'origine conservé).
    steps.sort((x, y) => {
      if (!x.date || !y.date) return 0;
      const n = Math.min(x.date.length, y.date.length, 10);
      return x.date.slice(0, n).localeCompare(y.date.slice(0, n)) || STAGE_RANK[x.stage] - STAGE_RANK[y.stage];
    });
    const chargesSrc = (v?.charges_check ?? [])
      .filter((ch) => p.charges.includes(ch.source))
      .map((ch) => check(ch.source, ch.quote, ch.supported, `Qualification « ${p.a.title} »`))
      .filter((x): x is JusticeSource => !!x && isOfficial(x.url));

    let status: AffairStatus = v?.current_status ?? "inconnu";
    const needs = STATUS_NEEDS[status];
    if (status !== "inconnu" && !steps.some((s) => needs.includes(s.stage))) {
      rejected.push(`${p.a.title} : état « ${status} » non étayé par une étape vérifiée → inconnu`);
      status = "inconnu";
    }
    const last = steps[steps.length - 1];
    const lastTs = toDate(last.date);
    const recent = lastTs !== null && Date.now() - lastTs < 365 * 86400_000;
    const confirmed = status !== "inconnu" && (CLOSED.includes(status) || recent);
    affairs.push({
      title: p.a.title,
      charges: chargesSrc.length ? p.a.charges : "Qualification exacte non confirmée par les sources vérifiées",
      charges_sources: chargesSrc,
      current_status: status,
      current_summary: status === "inconnu" ? `État actuel non établi par les sources vérifiées. Dernière étape vérifiée : ${last.text}` : (v?.current_summary ?? last.text),
      current_date: v?.current_date ?? last.date,
      current_jurisdiction: v?.current_jurisdiction ?? last.jurisdiction,
      current_confirmed: confirmed,
      contradiction: v?.contradiction?.trim() || null,
      steps,
      response: (() => {
        const rs = p.a.response?.sources.filter((s) => admissible(s, `Réaction (${p.a.title})`)) ?? [];
        return p.a.response && rs.length ? { text: p.a.response.text, sources: rs } : null;
      })(),
    });
  });
  const sanitized: CandidateAffair[] = [];
  for (const a of affairs) sanitized.push(await sanitizeAffair(a));
  return { affairs: sanitized, rejected, note: draft.not_found_note, proposed: draft.affairs.length };
}
