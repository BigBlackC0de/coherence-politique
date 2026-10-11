import { unzipSync } from "fflate";
import { getDb, getSqlite, nowIso, schema } from "../db";
import { fetchCached } from "./fetch-cache";
import { SENAT_MIN_DATE } from "./senat";
import { KIND_LABEL, MIN_CHARS, type StatementKind } from "./cri-an";
import type { JobContext } from "../jobs";

/**
 * Comptes rendus intégraux du Sénat (data.senat.fr, Licence Ouverte 2.0).
 * Dump unique `cri.zip` (~550 Mo, un fichier XHTML par jour de séance depuis 2003) :
 * on ne décompresse que les jours ≥ SENAT_MIN_DATE.
 *
 * Structure : <cri:intervenant parid="par_N" nom="Prénom NOM" type="1|2|0"> englobe les
 * <p> d'une même prise de parole (type 1 = sénateur, 2 = gouvernement). Les titres de
 * section sont des <cri:titreS1..S3>.
 */

export const SENAT_CRI_URL = "https://data.senat.fr/data/debats/cri.zip";

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** « Loïc HERVÉ » / « Loïc Hervé » → « loic herve » */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

function kindForTitles(titles: string[]): StatementKind {
  // Le Sénat n'émet pas toujours un titre « Discussion des articles » : un titre d'article en position la plus fine signale la discussion des articles.
  const inner = titles[titles.length - 1]?.toLowerCase() ?? "";
  if (/^(article|apr[èe]s l.article|avant l.article|articles? additionnel|intitul[ée]|annexe|titre |chapitre )/.test(inner)) return "debat";
  for (let i = titles.length - 1; i >= 0; i--) {
    const t = titles[i].toLowerCase();
    if (/questions? d.actualit[ée] au gouvernement|questions? au gouvernement/.test(t)) return "qag";
    if (/^questions? orales?/.test(t)) return "qosd";
    if (/explications? de vote|vote sur l.ensemble/.test(t)) return "explication-vote";
    if (/^discussion g[ée]n[ée]rale/.test(t)) return "discussion-generale";
    if (/question pr[ée]alable|motion|exception d.irrecevabilit[ée]/.test(t)) return "motion";
  }
  return "debat";
}

export interface SenatIntervention {
  id: string;
  speakerName: string;
  kind: StatementKind;
  title: string;
  text: string;
}

const TITLE_RE = /<cri:(titreS1bdc|titreS1|titreS2|titreS3|mentionarticle|mentionchapitre|mentiontitre|intitulechapitre|intituletitre)\b[^>]*>([\s\S]*?)<\/cri:\1>/g;

export function parseSenatCri(xhtml: string, date: string): SenatIntervention[] {
  const out: SenatIntervention[] = [];
  const titles: string[] = []; // [S1 = texte en discussion, S2 = phase (discussion générale, articles…), S3 = article / sujet]
  /** Les titres de section sont le plus souvent imbriqués dans l'intervention de la présidence : on les traite partout où ils apparaissent. */
  const applyTitles = (fragment: string) => {
    for (const t of fragment.matchAll(TITLE_RE)) {
      const text = stripTags(t[2]);
      if (!text) continue;
      if (t[1] === "titreS1bdc") continue; // sous-titre procédural (« Suite de la discussion d'un projet de loi »)
      if (t[1].startsWith("mention") || t[1].startsWith("intitule")) {
        // Article / chapitre / titre : on est dans la discussion des articles (le Sénat n'émet pas de titre de phase)
        titles.length = 1;
        titles[1] = "Discussion des articles";
        titles[2] = text;
        continue;
      }
      if (t[1] === "titreS1") {
        if (/^pr[ée]sidence de/i.test(text)) continue; // changement de président de séance
        titles.length = 0;
        titles[0] = text;
      } else if (t[1] === "titreS2") {
        titles.length = 1;
        titles[1] = text;
      } else {
        titles.length = 2;
        titles[2] = text;
      }
    }
  };
  const re = /<cri:intervenant\b([^>]*)>([\s\S]*?)<\/cri:intervenant>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xhtml))) {
    applyTitles(xhtml.slice(last, m.index)); // titres entre deux interventions
    last = m.index + m[0].length;
    const attrs = m[1];
    const type = attrs.match(/\btype="(\d)"/)?.[1];
    const qua = decode(attrs.match(/\bqua="([^"]*)"/)?.[1] ?? "");
    const inner = m[2];
    // Titres imbriqués : ceux qui précèdent le texte s'appliquent à cette intervention, les autres aux suivantes.
    const firstP = inner.search(/<p\b/);
    applyTitles(firstP >= 0 ? inner.slice(0, firstP) : inner);
    const titlesNow = titles.filter(Boolean);
    if (firstP >= 0) applyTitles(inner.slice(firstP));
    if (type !== "1") continue; // sénateurs seulement
    if (/pr[ée]sident/i.test(qua)) continue; // présidence de séance
    const nom = decode(attrs.match(/\bnom="([^"]*)"/)?.[1] ?? "");
    const parid = attrs.match(/\bparid="([^"]*)"/)?.[1] ?? String(out.length);
    const body = inner
      .replace(TITLE_RE, " ")
      .replace(/<span class="orateur_nom">[\s\S]*?<\/cri:orateurnom><\/span>/g, "") // nom de l'orateur en tête du 1er paragraphe
      .replace(/<cri:infoentreparentheses>[\s\S]*?<\/cri:infoentreparentheses>/g, " ") // (Applaudissements…)
      .replace(/<cri:amendements>[\s\S]*?<\/cri:amendements>/g, " ");
    const paras = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((p) => stripTags(p[1])).filter(Boolean);
    const text = paras.join("\n").trim();
    const kind = kindForTitles(titlesNow);
    if (text.length < (MIN_CHARS[kind] ?? 400)) continue;
    const tl = titlesNow.filter((t) => !/^(discussion g[ée]n[ée]rale|explications? de vote|discussion des articles|questions? d.actualit)/i.test(t));
    const title = (kind === "qag" || kind === "qosd" ? [tl[tl.length - 1]] : [tl[0], tl[tl.length - 1]]).filter((x, i, a) => x && a.indexOf(x) === i).join(" · ").slice(0, 300);
    out.push({ id: `senat-cri:${date}:${parid}`, speakerName: nom, kind, title, text });
  }
  return out;
}

export async function ingestSenatComptesRendus(ctx: JobContext) {
  const db = getDb();
  const sqlite = getSqlite();
  ctx.log(`Sénat — comptes rendus intégraux depuis ${SENAT_MIN_DATE} (dump data.senat.fr ≈ 550 Mo, mis en cache)`);
  const minName = `cri/d${SENAT_MIN_DATE.replace(/-/g, "")}.xml`;
  const buf = await fetchCached(SENAT_CRI_URL, { log: ctx.log, maxAgeHours: 20 });
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => /^cri\/d\d{8}\.xml$/.test(f.name) && f.name >= minName });
  const names = Object.keys(files).sort();
  ctx.log(`${names.length} jours de séance à examiner`);

  const seenRow = sqlite.prepare(`SELECT value FROM settings WHERE key = 'senat-cri:seen'`).get() as { value: string } | undefined;
  const seen: Record<string, number> = seenRow ? (JSON.parse(seenRow.value) as Record<string, number>) : {};
  const senators = new Map<string, { id: string; partyId: string | null; fullName: string }>();
  for (const s of sqlite.prepare(`SELECT id, party_id AS partyId, full_name AS fullName, first_name AS firstName, last_name AS lastName FROM politicians WHERE chamber = 'SENAT'`).all() as { id: string; partyId: string | null; fullName: string; firstName: string; lastName: string }[]) {
    senators.set(normalizeName(s.fullName), s);
    senators.set(normalizeName(`${s.lastName} ${s.firstName}`), s);
  }
  const insert = sqlite.prepare(
    `INSERT OR IGNORE INTO posts (id, handle, party_id, politician_id, kind, title, chamber, source_ref, text, created_at, url, likes, reposts, replies, views, source, ingested_at)
     VALUES (@id, @handle, @partyId, @politicianId, @kind, @title, 'SENAT', @sourceRef, @text, @createdAt, @url, 0, 0, 0, 0, 'senat-cri', @now)`,
  );
  // Ancien format d'URL (page introuvable sur senat.fr) : on corrige les lignes déjà importées.
  sqlite.prepare(`UPDATE posts SET url = replace(url, '.html', '_mono.html') WHERE source = 'senat-cri' AND url NOT LIKE '%_mono.html'`).run();
  const purge = sqlite.prepare(`DELETE FROM posts WHERE source = 'senat-cri' AND source_ref = ? AND id NOT IN (SELECT post_id FROM post_analyses)`);
  const decoder = new TextDecoder("iso-8859-1");

  let inserted = 0;
  let unknown = 0;
  let processed = 0;
  const byKind: Record<string, number> = {};
  ctx.setProgress(0, names.length);
  let i = 0;
  for (const name of names) {
    ctx.checkpoint();
    const data = files[name];
    delete files[name];
    i++;
    const size = data.length;
    const day = name.slice(5, 13);
    const date = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
    if (seen[name] === size) continue;
    const xhtml = decoder.decode(data);
    const items = parseSenatCri(xhtml, date);
    processed++;
    const url = `https://www.senat.fr/seances/s${day.slice(0, 6)}/s${day}/s${day}_mono.html`;
    sqlite.transaction(() => {
      if (seen[name]) purge.run(name);
      for (const it of items) {
        const sen = senators.get(normalizeName(it.speakerName));
        if (!sen) {
          unknown++;
          continue;
        }
        const r = insert.run({ id: it.id, handle: sen.fullName, partyId: sen.partyId, politicianId: sen.id, kind: it.kind, title: it.title || null, sourceRef: name, text: it.text, createdAt: `${date}T12:00:00`, url, now: nowIso() });
        if (r.changes) {
          inserted++;
          byKind[it.kind] = (byKind[it.kind] ?? 0) + 1;
        }
      }
    })();
    seen[name] = size;
    if (processed % 20 === 0) ctx.setProgress(i, names.length, `${inserted} interventions importées`);
  }
  db.insert(schema.settings)
    .values({ key: "senat-cri:seen", value: JSON.stringify(seen), updatedAt: nowIso() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: JSON.stringify(seen), updatedAt: nowIso() } })
    .run();
  ctx.setProgress(names.length, names.length, `${inserted} interventions importées`);
  ctx.log(
    `${processed} jours traités, ${inserted} interventions de sénateurs retenues (${Object.entries(byKind)
      .map(([k, n]) => `${KIND_LABEL[k] ?? k} : ${n}`)
      .join(", ") || "aucune"})${unknown ? ` — ${unknown} interventions non rattachées (nom inconnu de la base)` : ""}`,
  );
}
