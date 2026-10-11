import { eq } from "drizzle-orm";
import { getDb, nowIso, schema } from "../db";
import type { CandidateFact, CandidatePhoto, CandidateProfile, CandidateSource } from "../db/schema";
import { llm, modelFor, engine } from "../llm";
import { CandidateListOutput, CandidateProfileOutput, CandidateScopeOutput, type CandidateProfileOutputT } from "./schemas";
import type { JobContext } from "../jobs";
import { buildJustice, enforceOfficial, fetchSourceText, norm, sanitizeAffair, squash } from "./candidates-justice";

/**
 * Présidentielle 2027 : candidats déclarés / pressentis et fiches biographiques sourcées.
 *
 *  1. Liste : recherche web des candidatures annoncées ou très probables (source de presse pour chacune).
 *  2. Photo : uniquement Wikimedia Commons, licence libre vérifiée par l'API (auteur + licence conservés).
 *  3. Fiche : recherche web (dossier) puis mise en forme structurée ; chaque fait porte au moins une
 *     source indépendante du candidat. Les faits sans URL, sourcés uniquement par le candidat, son parti
 *     ou ses réseaux, ou dont tous les liens sont morts, sont écartés côté code.
 *
 * Le statut « officiel » (500 parrainages validés par le Conseil constitutionnel) n'est jamais posé
 * par la recherche : uniquement par l'administrateur (statusSetBy = "admin").
 */

export const CANDIDATE_STATUSES = ["declare", "pressenti", "officiel", "retire"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

const LIST_KEY = "candidates_list_refreshed_at";
const LIST_MAX_AGE_DAYS = 7;
const UA = "Coherence-Politique/1.0 (site citoyen non partisan ; fiches de candidats)";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/** Plafonds par rubrique : même longueur indicative pour tous les candidats. */
const CAPS = { identity: 3, family: 4, education: 4, career: 4, political: 5, mandates: 12, assets: 3, justice: 8, positions: 4, self_vs_sources: 3 } as const;

/** Domaines jamais acceptés comme source d'un fait (expression de la personne ou de son camp). */
const SELF_DOMAINS = ["x.com", "twitter.com", "facebook.com", "instagram.com", "tiktok.com", "threads.net", "linkedin.com", "t.me", "youtube.com", "youtu.be", "bsky.app", "substack.com", "medium.com"];

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const host = (u: string): string | null => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};
const hostMatches = (h: string, d: string) => h === d || h.endsWith(`.${d}`);

function getSetting(key: string): string | null {
  return getDb().select().from(schema.settings).where(eq(schema.settings.key, key)).get()?.value ?? null;
}
function setSetting(key: string, value: string) {
  getDb()
    .insert(schema.settings)
    .values({ key, value, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: nowIso() } })
    .run();
}

const SYSTEM = `Tu es le documentaliste politique de Cohérence-Politique : français, rigoureux, indépendant et non partisan.
Règles absolues :
- Même méthode, même structure, même niveau d'exigence pour chaque personnalité, quel que soit son bord politique.
- Uniquement des faits vérifiables, chacun rattaché à une source précise (URL exacte de la page consultée, nom du média ou de l'institution, date).
- Sources indépendantes de la personne : institutions (Assemblée nationale, Sénat, Parlement européen, Journal officiel, Légifrance, HATVP, Conseil constitutionnel, ministère de l'Intérieur), décisions de justice publiques, presse nationale et régionale reconnue, agences (AFP), enquêtes journalistiques, Wikipédia (avec prudence : recouper avec une autre source dès que possible).
- Jamais comme source d'un fait : le site du candidat, de son parti ou de sa campagne, ses réseaux sociaux, ses livres, ses interviews. Ce que la personne dit d'elle-même n'est rapporté que comme tel (« selon lui / selon elle ») et confronté aux sources indépendantes.
- Aucun adjectif de jugement, aucune interprétation, aucun sous-entendu. Pas de « controversé », « sulfureux », « brillant », etc.
- Affaires judiciaires : seulement les étapes établies (enquête ouverte, mise en examen, renvoi devant un tribunal, condamnation, appel, relaxe, non-lieu), avec le statut exact à la date la plus récente connue. Rappeler qu'une personne non définitivement condamnée est présumée innocente.
- Si une information n'est pas établie par une source fiable, ne pas l'écrire : la signaler comme lacune.
- Français clair, accessible à un lycéen.`;

/* ------------------------------------------------------------------ */
/* 1. Liste des candidats                                              */
/* ------------------------------------------------------------------ */

export async function refreshCandidateList(ctx: JobContext) {
  const db = getDb();
  const parties = db.select({ id: schema.parties.id, name: schema.parties.name }).from(schema.parties).all();
  const today = new Date().toISOString().slice(0, 10);
  ctx.log(`Recherche web de la liste des candidats via ${engine()} (${modelFor("main")})`);
  const search = await llm({
    task: "candidats-liste",
    system: SYSTEM,
    prompt: `Nous sommes le ${today}. L'élection présidentielle française est prévue au printemps 2027. La liste officielle des candidats (500 parrainages validés par le Conseil constitutionnel) n'est pas encore publiée.
Établis, par recherche web dans la presse récente, la liste des personnalités qui ont ANNONCÉ publiquement leur candidature à la présidentielle 2027, et de celles dont la candidature est présentée comme très probable par plusieurs médias nationaux (désignation par leur parti prévue, primaire en cours…). Inclure aussi les personnes qui avaient annoncé leur candidature puis y ont renoncé (statut « retiré »).
Couvre tout l'éventail politique de la même façon, de l'extrême gauche à l'extrême droite, y compris les petites candidatures déclarées si la presse nationale en rend compte.
Pour chaque personne : nom complet, parti ou mouvement, statut (déclaré / pressenti / retiré), date de l'annonce si déclaré, UNE source de presse indépendante (URL exacte, média, date) qui l'établit, titre exact de l'article Wikipédia en français, site de campagne ou personnel éventuel.
Ne retiens pas de simples rumeurs isolées. Termine par un tableau récapitulatif.`,
    tools: ["web"],
    model: "main",
    effort: "medium",
    ctx,
  });
  if (!search.text) throw new Error(`Recherche de la liste sans résultat (${search.error ?? "vide"})`);
  const parsed = await llm({
    task: "candidats-liste-parse",
    system: "Tu extrais des données structurées d'un texte, sans rien inventer ni ajouter. Réponds uniquement avec le JSON demandé.",
    prompt: `Partis connus de Cohérence-Politique (identifiant : nom) :\n${parties.map((p) => `${p.id} : ${p.name}`).join("\n")}\n\nExtrais la liste des candidats de ce texte. party_id = identifiant ci-dessus si le candidat est le candidat de ce parti, sinon null. Conserve les URL exactement.\n\n${search.text}`,
    schema: CandidateListOutput,
    model: "main",
    effort: "low",
    ctx,
  });
  const list = parsed.output?.candidates ?? [];
  if (!list.length) throw new Error(`Liste des candidats illisible (${parsed.error ?? "vide"})`);
  const partyIds = new Set(parties.map((p) => p.id));
  const matchParty = (label: string, ps: { id: string; name: string }[]): string | null => {
    const l = slugify(label);
    if (/independant|suspendu|exclu|dissident/.test(l)) return null; // rattachement incertain : pas de lien vers le parti
    return ps.find((p) => l === slugify(p.name) || l.startsWith(`${slugify(p.name)}-`))?.id ?? null;
  };
  let added = 0;
  let updated = 0;
  for (const c of list) {
    if (!/^https?:\/\//.test(c.status_source.url)) {
      ctx.log(`Ignoré (pas de source) : ${c.full_name}`);
      continue;
    }
    const id = slugify(c.full_name);
    if (!id) continue;
    const existing = db.select().from(schema.candidates).where(eq(schema.candidates.id, id)).get();
    const source: CandidateSource = { url: c.status_source.url, publisher: c.status_source.publisher, date: c.status_source.date, title: c.status_source.title };
    const common = {
      fullName: c.full_name,
      firstName: c.first_name,
      lastName: c.last_name,
      partyId: c.party_id && partyIds.has(c.party_id) ? c.party_id : matchParty(c.party_label, parties),
      partyLabel: c.party_label,
      declaredAt: c.declared_at,
      wikipediaTitle: c.wikipedia_fr_title ?? existing?.wikipediaTitle ?? null,
      officialSite: c.official_site ?? existing?.officialSite ?? null,
      updatedAt: nowIso(),
    };
    if (existing) {
      const statusFields = existing.statusSetBy === "admin" ? {} : { status: c.status, statusSource: source };
      db.update(schema.candidates).set({ ...common, ...statusFields }).where(eq(schema.candidates.id, id)).run();
      updated++;
    } else {
      db.insert(schema.candidates).values({ id, ...common, status: c.status, statusSetBy: "job", statusSource: source, createdAt: nowIso() }).run();
      added++;
    }
  }
  setSetting(LIST_KEY, nowIso());
  ctx.log(`Liste : ${list.length} candidats (${added} nouveaux, ${updated} mis à jour)`);
}

/* ------------------------------------------------------------------ */
/* 2. Photo libre (Wikimedia Commons)                                  */
/* ------------------------------------------------------------------ */

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastWikiCall = 0;
/** API Wikimedia : une requête par seconde au plus, nouvelle tentative sur 429 (limitation de débit). */
async function getJson(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastWikiCall + 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    lastWikiCall = Date.now();
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (res.status === 429 && attempt < 4) {
      await sleep(Number(res.headers.get("retry-after")) * 1000 || 5000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

/** Image principale de l'article Wikipédia, acceptée seulement si elle est sur Commons sous licence libre. */
export async function fetchCommonsPhoto(wikipediaTitle: string): Promise<CandidatePhoto | null> {
  const pi = (await getJson(`https://fr.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=name&redirects=1&format=json&titles=${encodeURIComponent(wikipediaTitle)}`)) as {
    query?: { pages?: Record<string, { pageimage?: string }> };
  };
  const file = Object.values(pi.query?.pages ?? {})[0]?.pageimage;
  if (!file) return null;
  const ii = (await getJson(`https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=480&format=json&titles=${encodeURIComponent(`File:${file}`)}`)) as {
    query?: { pages?: Record<string, { missing?: string; imageinfo?: { url: string; thumburl?: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] }> };
  };
  const page = Object.values(ii.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!page || page.missing !== undefined || !info) return null; // fichier local (non libre) ou absent de Commons
  const meta = info.extmetadata ?? {};
  const license = stripHtml(meta.LicenseShortName?.value ?? "");
  const nonFree = (meta.NonFree?.value ?? "").toLowerCase() === "true";
  // Commons n'héberge que des fichiers réutilisables librement (CC, domaine public, licences institutionnelles
  // de réutilisation comme celle du Parlement européen). On n'écarte pas ces dernières : cela priverait de photo,
  // de façon asymétrique, les candidats dont la seule image libre est un portrait institutionnel.
  if (nonFree || !license) return null;
  const clean = (u: string) => u.split("?")[0];
  const url = clean(info.thumburl ?? info.url);
  if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(url)) return null;
  return {
    url,
    fullUrl: clean(info.url),
    author: stripHtml(meta.Artist?.value ?? "") || "Auteur non indiqué sur Wikimedia Commons",
    license,
    licenseUrl: meta.LicenseUrl?.value ?? null,
    sourcePage: info.descriptionurl,
  };
}

/* ------------------------------------------------------------------ */
/* 3. Validation des sources                                           */
/* ------------------------------------------------------------------ */

const linkCache = new Map<string, boolean>();
/** Lien mort = 404/410 ou domaine injoignable. Les refus anti-robots (401/403/429…) ne sont pas des preuves d'URL inventée. */
async function linkAlive(url: string): Promise<boolean> {
  if (linkCache.has(url)) return linkCache.get(url)!;
  let alive = true;
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", headers: { "user-agent": BROWSER_UA, accept: "text/html,application/pdf,*/*;q=0.8", "accept-language": "fr-FR,fr;q=0.9" }, signal: AbortSignal.timeout(15000) });
    alive = res.status !== 404 && res.status !== 410;
    res.body?.cancel().catch(() => {});
  } catch (e) {
    const msg = String((e as Error & { cause?: { code?: string } }).cause?.code ?? (e as Error).message);
    alive = !/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ERR_INVALID_URL/.test(msg);
  }
  linkCache.set(url, alive);
  return alive;
}

interface Validator {
  blocked: string[];
  rejected: string[];
}

function cleanSource(s: { url: string; publisher: string; date: string | null; title?: string | null }): CandidateSource {
  return { url: s.url.trim(), publisher: s.publisher.trim(), date: s.date || null, title: s.title || null };
}

const isWikipedia = (u: string) => !!host(u)?.endsWith("wikipedia.org");

/**
 * Garde les sources valides d'un fait. `allowSelf` : pour « ce que dit le candidat », la source peut être
 * le candidat lui-même (interview, livre) — elle doit seulement avoir une URL.
 */
async function keepSources(v: Validator, label: string, sources: CandidateSource[], opts: { allowSelf?: boolean; needNonWikipedia?: boolean } = {}): Promise<CandidateSource[]> {
  const out: CandidateSource[] = [];
  for (const raw of sources) {
    const s = cleanSource(raw);
    const h = /^https?:\/\//.test(s.url) ? host(s.url) : null;
    if (!h) {
      v.rejected.push(`${label} — source sans URL valide (${s.publisher || "?"})`);
      continue;
    }
    if (!opts.allowSelf && v.blocked.some((d) => hostMatches(h, d))) {
      v.rejected.push(`${label} — source non indépendante écartée : ${s.url}`);
      continue;
    }
    if (!(await linkAlive(s.url))) {
      v.rejected.push(`${label} — lien introuvable (404) : ${s.url}`);
      continue;
    }
    out.push(s);
  }
  if (opts.needNonWikipedia && out.length && out.every((s) => isWikipedia(s.url))) {
    v.rejected.push(`${label} — fait sensible sourcé uniquement par Wikipédia, écarté`);
    return [];
  }
  return out;
}

/** Formulations qui signalent un fait non recoupé : il n'a pas sa place dans la fiche (il relève des lacunes). */
const UNVERIFIED = /selon wikip[ée]dia|(pas|non) (été )?recoup|aucune (autre )?source[^.]{0,40}ne (le )?confirm|information non v[ée]rifi/i;

async function keepFacts(v: Validator, rubric: string, facts: { text: string; sources: CandidateSource[] }[], cap: number, needNonWikipedia = false): Promise<CandidateFact[]> {
  const out: CandidateFact[] = [];
  for (const f of facts) {
    if (out.length >= cap) break;
    const text = f.text.trim();
    if (!text) continue;
    if (UNVERIFIED.test(text)) {
      v.rejected.push(`${rubric} : fait non recoupé écarté — « ${text.slice(0, 120)} »`);
      continue;
    }
    const before = v.rejected.length;
    const sources = await keepSources(v, `${rubric} : « ${text.slice(0, 80)} »`, f.sources, { needNonWikipedia });
    if (!sources.length && v.rejected.length === before) {
      v.rejected.push(`${rubric} : fait écarté faute de source valide — « ${text.slice(0, 120)} »`);
    }
    if (!sources.length) continue;
    out.push({ text, sources });
  }
  return out;
}

/**
 * Patrimoine : même exigence que la justice. Un fait n'est conservé que si :
 *  - il s'appuie sur un document OFFICIEL (HATVP, Journal officiel, Légifrance, Conseil constitutionnel, assemblées) ;
 *  - le texte de ce document a pu être lu ;
 *  - chaque montant ou chiffre du fait y figure tel quel. Un fait sans chiffre n'est pas vérifiable : il est écarté.
 * Seules les sources officielles vérifiées sont affichées.
 */
const OFFICIAL_ASSET_DOMAINS = ["hatvp.fr", "journal-officiel.gouv.fr", "legifrance.gouv.fr", "conseil-constitutionnel.fr", "assemblee-nationale.fr", "senat.fr", "data.gouv.fr"];
export async function verifyAssets(rubricLog: (m: string) => void, facts: CandidateFact[]): Promise<CandidateFact[]> {
  const out: CandidateFact[] = [];
  for (const f of facts) {
    const label = `Patrimoine : « ${f.text.slice(0, 90)} »`;
    const official = f.sources.filter((s) => {
      const h = host(s.url);
      return !!h && OFFICIAL_ASSET_DOMAINS.some((d) => hostMatches(h, d));
    });
    if (!official.length) {
      rubricLog(`${label} — écarté : aucune source officielle`);
      continue;
    }
    const nums = (squash(f.text).match(/\d+(?:[.,]\d+)?/g) ?? []).filter((n) => n.replace(/\D/g, "").length >= 2);
    if (!nums.length) {
      rubricLog(`${label} — écarté : aucun montant vérifiable dans le texte`);
      continue;
    }
    const verified: CandidateSource[] = [];
    for (const s of official) {
      const text = await fetchSourceText(s.url);
      if (!text) continue;
      const t = squash(text);
      if (nums.every((n) => t.includes(n))) verified.push(s);
    }
    if (!verified.length) {
      rubricLog(`${label} — écarté : montants absents du document officiel (ou document illisible)`);
      continue;
    }
    out.push({ text: f.text, sources: verified });
  }
  return out;
}

/** Applique la règle ci-dessus aux fiches déjà enregistrées (sans appel au modèle : seulement des lectures de pages). */
export async function auditAssets(ctx: JobContext) {
  const db = getDb();
  const rows = db.select().from(schema.candidates).all().filter((c) => c.profile && (c.profile.assets?.length || c.profile.justice?.length));
  ctx.setProgress(0, rows.length, `${rows.length} fiche(s) à contrôler (patrimoine, justice)`);
  let i = 0;
  for (const c of rows) {
    ctx.checkpoint();
    const profile = c.profile!;
    const dropped: string[] = [];
    const assets = profile.assets ?? [];
    const kept = await verifyAssets((m) => dropped.push(m), assets);
    // Justice : les étapes déjà vérifiées sont repassées au garde-fou (chiffres absents du document, tournures de presse).
    const justice = [];
    for (const a0 of (profile.justice ?? []).filter((x) => Array.isArray(x.steps))) {
      const a = enforceOfficial(a0);
      if (!a) {
        dropped.push(`Affaire retirée (aucune étape établie par un document officiel) : ${a0.title}`);
        continue;
      }
      justice.push(await sanitizeAffair(a));
    }
    const justiceChanged = JSON.stringify(justice) !== JSON.stringify(profile.justice ?? []);
    if (kept.length !== assets.length || dropped.length || justiceChanged) {
      const rejected = [...(c.rejected ?? []).filter((r) => !r.startsWith("Patrimoine")), ...dropped];
      db.update(schema.candidates).set({ profile: { ...profile, assets: kept, justice }, rejected, updatedAt: nowIso() }).where(eq(schema.candidates.id, c.id)).run();
    }
    ctx.log(`${c.fullName} : patrimoine ${assets.length} → ${kept.length} fait(s) ; justice ${justice.length} affaire(s)${justiceChanged ? " (texte réduit à ce que les documents établissent)" : ""}`);
    for (const d of dropped.slice(0, 6)) ctx.log(`   ${d}`);
    ctx.setProgress(++i, rows.length);
  }
}

async function validateProfile(o: CandidateProfileOutputT, blocked: string[]): Promise<{ profile: CandidateProfile; rejected: string[] }> {
  const v: Validator = { blocked, rejected: [] };
  const summary = (await keepFacts(v, "Présentation", [o.summary], 1))[0] ?? { text: "", sources: [] };
  const mandates: CandidateProfile["mandates"] = [];
  for (const m of o.mandates.slice(0, CAPS.mandates)) {
    const sources = await keepSources(v, `Mandat ${m.role}`, m.sources);
    if (!sources.length) {
      v.rejected.push(`Mandats : « ${m.role} — ${m.institution} » écarté faute de source valide`);
      continue;
    }
    mandates.push({ role: m.role, institution: m.institution, start: m.start, end: m.end, sources });
  }
  const selfVs: CandidateProfile["self_vs_sources"] = [];
  for (const s of o.self_vs_sources.slice(0, CAPS.self_vs_sources)) {
    const said = await keepSources(v, `Version du candidat (${s.topic})`, s.candidate_says.sources, { allowSelf: true });
    const shown = await keepSources(v, `Ce que montrent les sources (${s.topic})`, s.sources_show.sources, { needNonWikipedia: true });
    if (!said.length || !shown.length) {
      v.rejected.push(`Confrontation « ${s.topic} » écartée (sources insuffisantes de part ou d'autre)`);
      continue;
    }
    selfVs.push({ topic: s.topic, candidate_says: { text: s.candidate_says.text, sources: said }, sources_show: { text: s.sources_show.text, sources: shown } });
  }
  const profile: CandidateProfile = {
    summary,
    identity: await keepFacts(v, "Identité", o.identity, CAPS.identity),
    family: await keepFacts(v, "Famille et origines", o.family, CAPS.family, true),
    education: await keepFacts(v, "Études", o.education, CAPS.education),
    career: await keepFacts(v, "Carrière hors politique", o.career, CAPS.career),
    political: await keepFacts(v, "Parcours politique", o.political, CAPS.political),
    mandates,
    assets: await verifyAssets((m) => v.rejected.push(m), await keepFacts(v, "Patrimoine", o.assets, CAPS.assets)),
    justice: [], // rempli par la passe judiciaire dédiée (candidates-justice.ts)
    positions: await keepFacts(v, "Positions", o.positions, CAPS.positions),
    self_vs_sources: selfVs,
    gaps: o.gaps.slice(0, 8),
  };
  return { profile, rejected: v.rejected };
}

/* ------------------------------------------------------------------ */
/* 4. Fiche                                                            */
/* ------------------------------------------------------------------ */

function blockedDomains(c: typeof schema.candidates.$inferSelect): string[] {
  const db = getDb();
  const out = new Set(SELF_DOMAINS);
  const site = c.officialSite ? host(c.officialSite) : null;
  if (site) out.add(site);
  if (c.partyId) {
    const p = db.select().from(schema.parties).where(eq(schema.parties.id, c.partyId)).get();
    const h = p?.website ? host(p.website) : null;
    if (h) out.add(h);
  }
  return [...out];
}

async function buildProfile(ctx: JobContext, c: typeof schema.candidates.$inferSelect) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const blocked = blockedDomains(c);
  ctx.log(`Recherche web : fiche de ${c.fullName}`);
  const research = await llm({
    task: "candidats-recherche",
    system: SYSTEM,
    prompt: `Nous sommes le ${today}. Prépare un dossier documentaire factuel sur ${c.fullName} (${c.partyLabel ?? "sans étiquette"}), candidat(e) déclaré(e) ou pressenti(e) à l'élection présidentielle française de 2027${c.wikipediaTitle ? ` (article Wikipédia : « ${c.wikipediaTitle} »)` : ""}.
Rubriques, dans cet ordre, avec pour CHAQUE fait l'URL exacte de la page consultée, le nom du média ou de l'institution et la date :
1. Identité : date et lieu de naissance, situation familiale publique.
2. Parcours familial et origines sociales : professions des parents, milieu, lieu de jeunesse. Seulement d'après des sources indépendantes (presse, enquêtes, biographies non autorisées) ; si le récit que la personne fait de ses origines diffère de ce que montrent ces sources, documente les deux versions séparément.
3. Études et diplômes : établissements, années, diplômes obtenus ou non.
4. Carrière professionnelle hors politique.
5. Parcours politique : adhésions, fonctions partisanes, campagnes précédentes.
6. Mandats électifs et fonctions gouvernementales avec dates de début et de fin (sources institutionnelles de préférence : assemblee-nationale.fr, senat.fr, europarl.europa.eu, legifrance, gouvernement).
7. Patrimoine et intérêts déclarés : UNIQUEMENT d'après un document officiel (déclaration publiée sur hatvp.fr, Journal officiel, Conseil constitutionnel). Reprends les montants EXACTEMENT comme écrits dans le document (mêmes chiffres, même unité), avec la date de la déclaration et l'URL du document. Pas d'estimation, pas d'article de presse, pas de Wikipédia, pas d'arrondi : un montant qui ne figure pas mot pour mot dans le document officiel sera retiré.
8. Affaires judiciaires : NE PAS les traiter ici (elles font l'objet d'une recherche dédiée et vérifiée séparément).
9. Deux à quatre propositions ou positions clés pour 2027, telles que rapportées par la presse.
10. « Ce qu'il/elle dit de lui/d'elle-même » vs « ce que montrent les sources » : uniquement s'il existe un écart documenté par des sources indépendantes.
N'utilise JAMAIS comme source d'un fait : le site du candidat, de son parti ou de sa campagne, ses réseaux sociaux, ses livres ou interviews (sauf pour rapporter, au point 10, ce qu'il dit de lui-même). Recoupe Wikipédia avec une autre source dès que possible. IMPORTANT : pour les origines familiales (point 2) et le point 10, une source autre que Wikipédia est OBLIGATOIRE (portrait dans la presse nationale ou régionale, enquête, agence) : sans elle, le fait sera retiré de la fiche. Cherche donc activement des portraits de presse.
Sois efficace : privilégie Wikipédia FR pour repérer les faits puis vérifie-les sur des sources de presse ou institutionnelles. Pas d'adjectif de jugement. Indique explicitement ce que tu n'as pas pu établir.`,
    tools: ["web"],
    model: "main",
    effort: "medium",
    ctx,
  });
  if (!research.text || research.text.length < 400) throw new Error(`recherche vide (${research.error ?? "texte trop court"})`);
  const structured = await llm({
    task: "candidats-fiche",
    system: SYSTEM,
    prompt: `Mets en forme la fiche de ${c.fullName} à partir UNIQUEMENT du dossier fourni. N'ajoute aucun fait absent du dossier. Chaque fait doit reprendre l'URL exacte, le média/l'institution et la date donnés dans le dossier ; un fait sans URL ne doit pas figurer. Respecte les nombres de faits indiqués pour chaque rubrique : même longueur pour tous les candidats. Phrases courtes, neutres, sans adjectif de jugement ; ne cite pas la source dans le texte du fait (pas de « selon Wikipédia »), elle est affichée à côté. Ne traite pas les affaires judiciaires (rubrique séparée). Pour « self_vs_sources », la version du candidat est au style indirect (« Selon lui… » / « Selon elle… »).`,
    textDoc: { title: `Dossier documentaire — ${c.fullName}`, text: research.text },
    schema: CandidateProfileOutput,
    model: "main",
    effort: "medium",
    ctx,
  });
  if (!structured.output) throw new Error(`mise en forme impossible (${structured.error ?? "?"})`);
  const o = structured.output;
  const { profile, rejected } = await validateProfile(o, blocked);
  if (!profile.summary.text) throw new Error("présentation sans source valide — fiche non enregistrée");
  try {
    const j = await buildJustice(ctx, c, blocked, SYSTEM);
    rejected.push(...j.rejected);
    if (j.affairs.length === 0 && j.proposed > 0) {
      // Des affaires ont été trouvées mais aucune n'est établie par une source officielle : ne pas afficher « aucune procédure ».
      ctx.log(`${c.fullName} : ${j.proposed} affaire(s) trouvée(s), aucune établie par une source officielle — rubrique laissée « en cours de vérification »`);
    } else {
      profile.justice = j.affairs;
      profile.justice_checked_at = nowIso();
    }
  } catch (e) {
    // Rubrique laissée « en cours de vérification » (jamais affichée comme vide).
    ctx.log(`${c.fullName} : passe judiciaire en échec — ${(e as Error).message}`);
  }
  db.update(schema.candidates)
    .set({
      birthDate: o.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(o.birth_date) ? o.birth_date : c.birthDate,
      birthPlace: o.birth_place ?? c.birthPlace,
      tagline: o.tagline,
      profile,
      profileModel: modelFor("main"),
      profileAt: nowIso(),
      rejected,
      updatedAt: nowIso(),
    })
    .where(eq(schema.candidates.id, c.id))
    .run();
  const n = profile.identity.length + profile.family.length + profile.education.length + profile.career.length + profile.political.length + profile.mandates.length + profile.assets.length + profile.justice.length + profile.positions.length;
  ctx.log(`${c.fullName} : fiche enregistrée (${n} faits, ${rejected.length} écartés)`);
  for (const r of rejected.slice(0, 10)) ctx.log(`   écarté : ${r}`);
}

/* ------------------------------------------------------------------ */
/* 5. Périmètre : trois critères objectifs, identiques pour tous         */
/* ------------------------------------------------------------------ */

const AN_DEPUTES_URL = "https://www.assemblee-nationale.fr/dyn/deputes";
const SENAT_URL = "https://www.senat.fr/senateurs/senatl.html";

/** Parlementaires nationaux en exercice (données officielles AN + Sénat déjà importées). */
const activeParliamentarians = () =>
  getDb()
    .select({ id: schema.politicians.id, fullName: schema.politicians.fullName, partyId: schema.politicians.partyId, chamber: schema.politicians.chamber })
    .from(schema.politicians)
    .where(eq(schema.politicians.active, true))
    .all();
const bareName = (n: string) => slugify(n.replace(/\s*\(.*\)\s*$/, ""));

/**
 * Décisions du Conseil constitutionnel proclamant les résultats du premier tour : elles listent tous les candidats
 * officiels (500 parrainages validés). Contrôle programmatique du critère 2 : le nom figure-t-il dans le texte ?
 */
const CC_RESULTS: { year: number; url: string }[] = [
  { year: 2012, url: "https://www.conseil-constitutionnel.fr/decision/2012/2012152PDR.htm" },
  { year: 2017, url: "https://www.conseil-constitutionnel.fr/decision/2017/2017169PDR.htm" },
  { year: 2022, url: "https://www.conseil-constitutionnel.fr/decision/2022/2022195PDR.htm" },
];
const RECOGNIZED_INSTITUTES = /ifop|elabe|ipsos|bva|opinionway|odoxa|harris|toluna|cluster ?17|viavoice|csa|kantar|verian|yougov/i;
const POLL_WINDOW_DAYS = 92;

// Règle affichée au public : SCOPE_HELP (src/components/candidate-ui.tsx).

/**
 * Règle éditoriale (identique pour tous) : dans le périmètre si AU MOINS UN des trois critères est rempli et sourcé.
 * Les personnes qui disent elles-mêmes ne pas être candidates restent dehors.
 * Hors périmètre = masqué des pages, jamais supprimé ; l'admin peut revenir en arrière (décisions admin jamais écrasées).
 */
async function checkScope(ctx: JobContext, c: typeof schema.candidates.$inferSelect) {
  const db = getDb();
  const at = nowIso();
  const today = at.slice(0, 10);
  const met: string[] = [];
  const sources: CandidateSource[] = [];
  const parl = activeParliamentarians();

  // Critère 1 (contrôle sur nos données officielles) : parti suivi par Cohérence-Politique avec des élus, ou personne elle-même parlementaire.
  const self = parl.find((p) => bareName(p.fullName) === slugify(c.fullName));
  const partyParl = c.partyId ? parl.filter((p) => p.partyId === c.partyId) : [];
  if (self) {
    met.push(`(1) ${self.chamber === "AN" ? "député(e)" : "sénateur/sénatrice"} en exercice`);
    sources.push({ url: self.chamber === "AN" ? `${AN_DEPUTES_URL}/${self.id}` : SENAT_URL, publisher: self.chamber === "AN" ? "Assemblée nationale" : "Sénat", date: today, title: self.fullName });
  } else if (partyParl.length) {
    const p = db.select().from(schema.parties).where(eq(schema.parties.id, c.partyId!)).get();
    const an = partyParl.filter((x) => x.chamber === "AN").length;
    const se = partyParl.length - an;
    met.push(`(1) ${p?.name ?? c.partyId} : ${an} député(s), ${se} sénateur(s) en exercice`);
    sources.push({ url: AN_DEPUTES_URL, publisher: "Assemblée nationale / Sénat (données officielles)", date: today, title: "Parlementaires en exercice" });
  }

  // Critère 2 (contrôle programmatique sur les décisions du Conseil constitutionnel).
  const pastYears: number[] = [];
  for (const d of CC_RESULTS) {
    const t = await fetchSourceText(d.url);
    if (t && norm(t).includes(norm(c.fullName))) {
      pastYears.push(d.year);
      sources.push({ url: d.url, publisher: "Conseil constitutionnel", date: `${d.year}`, title: `Résultats du premier tour de l'élection présidentielle ${d.year}` });
    }
  }

  // Recherche web : désistement, élus (députés européens compris), candidatures antérieures, sondages.
  const search = await llm({
    task: "candidats-perimetre",
    system: SYSTEM,
    prompt: `Nous sommes le ${today}. ${c.fullName} est présenté(e) comme candidat(e) déclaré(e) ou pressenti(e) à la présidentielle 2027 (étiquette rapportée : « ${c.partyLabel ?? "non précisée"} »). Vérifie, avec sources (URL exactes, média ou institution, date) :
0. La personne a-t-elle déclaré elle-même, selon la presse récente, ne PAS être candidate ou avoir renoncé ?
1. Sous quelle étiquette se présente-t-elle, et ce parti/mouvement compte-t-il AUJOURD'HUI au moins un parlementaire en exercice : député, sénateur ou député européen (ou la personne l'est-elle elle-même) ? Donne les noms.
2. A-t-elle déjà été candidate OFFICIELLE à une élection présidentielle (500 parrainages validés, liste publiée par le Conseil constitutionnel) ? Quelles années ? Source : conseil-constitutionnel.fr de préférence.
3. Dans les sondages nationaux d'intentions de vote pour le premier tour de 2027 publiés depuis le ${new Date(Date.now() - POLL_WINDOW_DAYS * 86400_000).toISOString().slice(0, 10)} par un institut reconnu (Ifop, Elabe, Ipsos-BVA, OpinionWay, Odoxa, Harris Interactive/Toluna, Cluster17…), quel est son meilleur score ? Donne institut, date de publication, score et URL de l'article ou de la notice.
Faits uniquement, sans commentaire.`,
    tools: ["web"],
    model: "main",
    effort: "low",
    ctx,
  });
  if (!search.text) throw new Error(`vérification du périmètre impossible (${search.error ?? "vide"})`);
  const parsed = await llm({
    task: "candidats-perimetre-parse",
    system: "Tu extrais des données structurées d'un texte, sans rien inventer. Réponds uniquement avec le JSON demandé.",
    prompt: `Extrais la réponse de ce texte (URL exactes) :\n\n${search.text}`,
    schema: CandidateScopeOutput,
    model: "main",
    effort: "low",
    ctx,
  });
  const o = parsed.output;
  if (!o) throw new Error(`périmètre illisible (${parsed.error ?? "?"})`);
  const src = (s: { url: string; publisher: string; date: string | null; title: string | null }): CandidateSource => ({ url: s.url, publisher: s.publisher, date: s.date, title: s.title });
  const withUrl = <T extends { url: string }>(xs: T[]) => xs.filter((s) => /^https?:\/\//.test(s.url));

  // Désistement déclaré : hors périmètre, quel que soit le reste.
  if (o.declines && o.declines_source && /^https?:\/\//.test(o.declines_source.url)) {
    const reason = `${c.fullName} dit ne pas être candidat(e) (ou avoir renoncé), selon ${o.declines_source.publisher}. ${o.reason}`;
    db.update(schema.candidates).set({ scope: "out", scopeReason: reason, scopeSources: [src(o.declines_source)], scopeSetBy: "job", scopeCheckedAt: at }).where(eq(schema.candidates.id, c.id)).run();
    ctx.log(`${c.fullName} : HORS PÉRIMÈTRE — ${reason}`);
    return;
  }

  // Critère 1 (web) : parlementaires, y compris députés européens, avec source.
  if (!met.some((m) => m.startsWith("(1)")) && o.parliament.met && o.parliament.members.length && withUrl(o.parliament.sources).length) {
    const confirmed = o.parliament.members.filter((m) => m.mandate === "depute_europeen" || parl.some((p) => bareName(p.fullName) === slugify(m.name)));
    if (confirmed.length) {
      met.push(`(1) ${o.candidacy_label} : ${confirmed.map((m) => `${m.name} (${m.mandate === "depute" ? "député" : m.mandate === "senateur" ? "sénateur" : "député européen"})`).join(", ")}`);
      sources.push(...withUrl(o.parliament.sources).slice(0, 3).map(src));
    } else ctx.log(`${c.fullName} : élus cités non retrouvés parmi les parlementaires en exercice (${o.parliament.members.map((m) => m.name).join(", ")})`);
  }
  // Critère 2 (web) : années non couvertes par le contrôle automatique (avant 2012), source du Conseil constitutionnel exigée.
  const ccSources = withUrl(o.past_candidacy.sources).filter((s) => host(s.url)?.endsWith("conseil-constitutionnel.fr"));
  const olderYears = o.past_candidacy.met ? o.past_candidacy.years.filter((y) => y < 2012 && !pastYears.includes(y)) : [];
  if (olderYears.length && ccSources.length) {
    for (const s of ccSources.slice(0, 2)) {
      const t = await fetchSourceText(s.url);
      if (t && norm(t).includes(norm(c.lastName))) {
        pastYears.push(...olderYears);
        sources.push(src(s));
        break;
      }
    }
  }
  if (pastYears.length) met.push(`(2) candidat(e) officiel(le) en ${[...new Set(pastYears)].sort().join(", ")}`);
  // Critère 3 : sondage récent ≥ 1 %, institut reconnu, date dans la fenêtre, URL.
  const minDate = Date.now() - POLL_WINDOW_DAYS * 86400_000;
  const okPolls = o.polls.filter((p) => p.score >= 1 && RECOGNIZED_INSTITUTES.test(p.institute) && /^https?:\/\//.test(p.source.url) && Date.parse(p.date) >= minDate && Date.parse(p.date) <= Date.now() + 86400_000);
  if (okPolls.length) {
    const best = okPolls.sort((a, b) => b.score - a.score)[0];
    met.push(`(3) ${best.score.toLocaleString("fr-FR")} % — ${best.institute}, ${best.date}`);
    sources.push(src(best.source));
  }

  const scope: "in" | "out" = met.length ? "in" : "out";
  const reason = met.length ? `Critère(s) rempli(s) : ${met.join(" ; ")}.` : `Aucun critère rempli (pas de parlementaire en exercice confirmé pour « ${o.candidacy_label} », pas de candidature officielle antérieure, pas de sondage récent à 1 % ou plus). ${o.reason}`;
  db.update(schema.candidates).set({ scope, scopeReason: reason, scopeSources: sources, scopeSetBy: "job", scopeCheckedAt: at }).where(eq(schema.candidates.id, c.id)).run();
  ctx.log(`${c.fullName} : ${scope === "in" ? "dans le périmètre" : "HORS PÉRIMÈTRE"} — ${reason}`);
}

export function setCandidateScope(ids: string[], scope: "in" | "out", reason: string): number {
  const db = getDb();
  let n = 0;
  for (const id of ids) {
    const r = db.update(schema.candidates).set({ scope, scopeReason: reason, scopeSetBy: "admin", scopeCheckedAt: nowIso() }).where(eq(schema.candidates.id, id)).run();
    n += r.changes;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Job                                                                 */
/* ------------------------------------------------------------------ */

export interface CandidatesJobParams {
  /** Ne traiter que ces identifiants (slugs). */
  ids?: string[];
  /** Nombre maximum de fiches à rédiger dans ce passage. */
  limit?: number;
  /** Refaire les fiches existantes (avec ids : seulement celles-ci). */
  force?: boolean;
  /** Rafraîchir la liste : true / false ; par défaut si vide ou plus vieille que 7 jours. */
  list?: boolean;
  /** Revérifier le périmètre (partis avec députés) même s'il est déjà établi (hors décisions de l'admin). */
  rescope?: boolean;
  /** Ne faire que le contrôle de périmètre (aucune fiche). */
  scopeOnly?: boolean;
  /** Ne refaire que la rubrique judiciaire des fiches existantes (passe dédiée et vérifiée). */
  justice?: boolean;
  /** Action d'administration locale : poser ce statut sur `ids` (aucun appel au modèle). */
  setStatus?: CandidateStatus;
  /** Source du statut posé (ex. URL de la décision du Conseil constitutionnel). */
  statusUrl?: string;
  /** Action d'administration locale : forcer le périmètre ("in" | "out") sur `ids`. */
  setScope?: "in" | "out";
  scopeReason?: string;
}

export function setCandidateStatus(ids: string[], status: CandidateStatus, statusUrl?: string): number {
  const db = getDb();
  let n = 0;
  for (const id of ids) {
    const c = db.select().from(schema.candidates).where(eq(schema.candidates.id, id)).get();
    if (!c) continue;
    const statusSource: CandidateSource | null = statusUrl ? { url: statusUrl, publisher: status === "officiel" ? "Conseil constitutionnel" : host(statusUrl) ?? "source", date: new Date().toISOString().slice(0, 10), title: null } : c.statusSource;
    db.update(schema.candidates).set({ status, statusSetBy: "admin", statusSource, updatedAt: nowIso() }).where(eq(schema.candidates.id, id)).run();
    n++;
  }
  return n;
}

async function redoJustice(ctx: JobContext, c: typeof schema.candidates.$inferSelect) {
  if (!c.profile) return;
  const j = await buildJustice(ctx, c, blockedDomains(c), SYSTEM);
  const rejected = [...(c.rejected ?? []).filter((r) => !/^(Justice|Étape|Affaire|Qualification|Réaction)/.test(r)), ...j.rejected];
  if (j.affairs.length === 0 && j.proposed > 0) {
    // Rien d'établi par une source officielle alors que la recherche a trouvé des affaires : on ne remplace pas la rubrique
    // (ni « aucune procédure » affiché à tort, ni ancien contenu écrasé) ; le détail des écarts reste consultable en admin.
    getDb().update(schema.candidates).set({ rejected, updatedAt: nowIso() }).where(eq(schema.candidates.id, c.id)).run();
    ctx.log(`${c.fullName} : ${j.proposed} affaire(s) trouvée(s), aucune établie par une source officielle — rubrique inchangée`);
    for (const r of j.rejected.slice(0, 12)) ctx.log(`   écarté : ${r}`);
    return;
  }
  const profile = { ...c.profile, justice: j.affairs, justice_checked_at: nowIso() };
  getDb().update(schema.candidates).set({ profile, rejected, updatedAt: nowIso() }).where(eq(schema.candidates.id, c.id)).run();
  ctx.log(`${c.fullName} : rubrique judiciaire vérifiée (${j.affairs.length} affaire(s), ${j.rejected.length} élément(s) écarté(s))`);
  for (const r of j.rejected.slice(0, 12)) ctx.log(`   écarté : ${r}`);
}

export async function runCandidatesJob(ctx: JobContext, params: CandidatesJobParams = {}) {
  const db = getDb();
  if (params.setStatus) {
    if (!CANDIDATE_STATUSES.includes(params.setStatus)) throw new Error(`Statut invalide : ${params.setStatus}`);
    if (!params.ids?.length) throw new Error("setStatus exige des identifiants (ids)");
    if (params.setStatus === "officiel" && !params.statusUrl) throw new Error("Le statut « officiel » exige --status-url (décision du Conseil constitutionnel)");
    const n = setCandidateStatus(params.ids, params.setStatus, params.statusUrl);
    ctx.log(`Statut « ${params.setStatus} » posé sur ${n} candidat(s) (verrouillé : la recherche ne le modifiera plus)`);
    return;
  }
  if (params.setScope) {
    if (!params.ids?.length) throw new Error("setScope exige des identifiants (ids)");
    const n = setCandidateScope(params.ids, params.setScope, params.scopeReason ?? "Décision de l'administrateur");
    ctx.log(`Périmètre « ${params.setScope} » posé sur ${n} candidat(s) (verrouillé)`);
    return;
  }

  const last = getSetting(LIST_KEY);
  const count = db.select({ id: schema.candidates.id }).from(schema.candidates).all().length;
  const stale = !last || Date.now() - new Date(last).getTime() > LIST_MAX_AGE_DAYS * 86400_000;
  const doList = params.list ?? (!params.ids?.length && !params.justice && !params.scopeOnly && (count === 0 || stale));
  if (doList) {
    ctx.setProgress(0, 1, "Recherche des candidats déclarés…");
    await refreshCandidateList(ctx);
  } else ctx.log(`Liste conservée (dernière recherche : ${last ?? "jamais"})`);

  const selected = (c: { id: string }) => !params.ids?.length || params.ids.includes(c.id);
  const sorted = () =>
    db
      .select()
      .from(schema.candidates)
      .all()
      .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr"));
  const unknown = (params.ids ?? []).filter((id) => !sorted().some((c) => c.id === id));
  if (unknown.length) ctx.log(`Identifiants inconnus : ${unknown.join(", ")}`);

  // Périmètre : à établir pour les nouveaux ; jamais remis en cause s'il a été posé par l'admin.
  for (const c of sorted().filter(selected)) {
    if (c.scopeSetBy === "admin") continue;
    if (c.scope && !params.rescope) continue;
    ctx.checkpoint();
    try {
      await checkScope(ctx, c);
    } catch (e) {
      ctx.log(`${c.fullName} : périmètre non vérifié — ${(e as Error).message}`);
    }
  }
  if (params.scopeOnly) return;
  // Hors périmètre : ignorés, sauf si l'admin les désigne explicitement par --ids (fiche conservée mais masquée).
  const all = sorted().filter((c) => c.scope === "in" || (params.ids?.length && params.ids.includes(c.id)));

  if (params.justice) {
    const todo = all.filter(selected).filter((c) => c.profile);
    ctx.setProgress(0, todo.length, `${todo.length} rubrique(s) judiciaire(s) à vérifier`);
    let i = 0;
    let failed = 0;
    for (const c of todo) {
      ctx.checkpoint();
      try {
        await redoJustice(ctx, c);
      } catch (e) {
        failed++;
        ctx.log(`${c.fullName} : échec de la passe judiciaire — ${(e as Error).message}`);
      }
      ctx.setProgress(++i, todo.length);
    }
    // Un échec silencieux ressemblerait à un succès : si rien n'a abouti, le job doit finir en erreur.
    if (todo.length > 0 && failed === todo.length) throw new Error(`Passe judiciaire en échec pour ${failed} fiche(s) sur ${todo.length}`);
    return;
  }

  // Photos (gratuit, API Wikimedia).
  for (const c of all.filter(selected)) {
    if (c.photo && !params.force) continue;
    try {
      const photo = await fetchCommonsPhoto(c.wikipediaTitle ?? c.fullName);
      db.update(schema.candidates).set({ photo, updatedAt: nowIso() }).where(eq(schema.candidates.id, c.id)).run();
      ctx.log(`${c.fullName} : ${photo ? `photo libre (${photo.license})` : "pas de photo libre — initiales"}`);
    } catch (e) {
      ctx.log(`${c.fullName} : photo indisponible (${(e as Error).message})`);
    }
  }

  let todo = all.filter(selected).filter((c) => params.force || !c.profile);
  if (!params.ids?.length) todo = todo.filter((c) => c.status !== "retire");
  if (params.limit !== undefined && Number.isFinite(params.limit)) todo = todo.slice(0, Math.max(0, params.limit));
  ctx.setProgress(0, todo.length, `${todo.length} fiche(s) à rédiger`);
  let i = 0;
  let failed = 0;
  for (const c of todo) {
    ctx.checkpoint();
    try {
      await buildProfile(ctx, c);
    } catch (e) {
      failed++;
      ctx.log(`${c.fullName} : échec — ${(e as Error).message}`);
    }
    ctx.setProgress(++i, todo.length);
  }
  ctx.log(`Terminé : ${i - failed} fiche(s) rédigée(s), ${failed} échec(s)`);
}
