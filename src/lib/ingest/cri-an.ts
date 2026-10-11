import { unzipSync, strFromU8 } from "fflate";
import { getDb, getSqlite, nowIso, schema } from "../db";
import { fetchCached } from "./fetch-cache";
import { AN_LEGISLATURE } from "./an";
import type { JobContext } from "../jobs";

/**
 * Comptes rendus intégraux des séances publiques de l'Assemblée nationale
 * (open data officiel, format Syceron). Gratuit, mis à jour chaque nuit.
 *
 * On ne retient que les interventions substantielles des députés (identifiés par
 * leur id_acteur officiel), classées par nature : question au gouvernement,
 * explication de vote, discussion générale, motion, question orale, débat.
 * Les interruptions, rappels au règlement et la présidence de séance sont ignorés.
 */

export const AN_CRI_URL = `https://data.assemblee-nationale.fr/static/openData/repository/${AN_LEGISLATURE}/vp/syceronbrut/syseron.xml.zip`;

export type StatementKind = "qag" | "explication-vote" | "discussion-generale" | "motion" | "qosd" | "debat" | "communique" | "tweet";

/** Longueur minimale (caractères) par nature : on écarte les « Très bien ! » et les présentations d'amendements d'une phrase. */
export const MIN_CHARS: Record<string, number> = { qag: 200, "explication-vote": 250, "discussion-generale": 400, motion: 400, qosd: 200, debat: 1200 };

export const KIND_LABEL: Record<string, string> = {
  qag: "Question au gouvernement",
  "explication-vote": "Explication de vote",
  "discussion-generale": "Discussion générale",
  motion: "Motion",
  qosd: "Question orale",
  debat: "Débat",
  communique: "Communiqué",
  tweet: "Message X",
};

/** Ordre de priorité pour l'analyse par Claude (les plus politiques d'abord). */
export const KIND_PRIORITY: Record<string, number> = { qag: 6, "explication-vote": 5, communique: 5, tweet: 4, "discussion-generale": 3, motion: 3, qosd: 2, debat: 1 };

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

/** Texte d'une intervention : retire les didascalies en italique « (Applaudissements…) », conserve les sauts de ligne. */
export function cleanSyceronText(inner: string): string {
  return decodeEntities(
    inner
      .replace(/<\/italique>(\s*[–-]?\s*)<italique>/g, "$1") // fusionne les italiques découpés
      .replace(/<italique>\s*\([^<]*\)\s*<\/italique>/g, " ") // didascalies
      .replace(/<italique>\s*\([^<]*<\/italique>/g, " ")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

const attr = (tag: string, name: string): string | null => {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
};

interface PointCtx {
  code: string;
  title: string;
}

export interface AnIntervention {
  id: string; // an-cri:<uid>:<id_syceron>
  acteurId: string;
  speaker: string;
  kind: StatementKind;
  title: string;
  text: string;
  order: number;
}

function kindFor(stack: PointCtx[]): StatementKind {
  for (let i = stack.length - 1; i >= 0; i--) {
    const { code, title } = stack[i];
    const t = title.toLowerCase();
    if (code.startsWith("QG_") || /^questions? au (gouvernement|premier ministre)/.test(t)) return "qag";
    if (code.startsWith("QOSD_") || /^questions? orales? sans d/.test(t)) return "qosd";
    if (/^explications? de vote/.test(t)) return "explication-vote";
    if (code.startsWith("DISC_GENERALE") || /^discussion g[ée]n[ée]rale/.test(t)) return "discussion-generale";
    if (/^motions? de (rejet|censure)|^question pr[ée]alable/.test(t)) return "motion";
  }
  return "debat";
}

function titleFor(stack: PointCtx[], kind: StatementKind): string {
  if (kind === "qag") return stack[stack.length - 1]?.title ?? "Question au gouvernement";
  const titles = stack.map((p) => p.title).filter((t) => t && !/^(discussion g[ée]n[ée]rale|explications? de vote|discussion des articles|pr[ée]sentation|questions? au gouvernement)/i.test(t));
  const uniq = [...new Set(titles)];
  const out = [uniq[0], uniq[uniq.length - 1]].filter((x, i, a) => x && a.indexOf(x) === i) as string[];
  return out.join(" · ").slice(0, 300);
}

/** Parse un compte rendu Syceron : métadonnées + interventions des députés. */
export function parseCompteRendu(xml: string): { uid: string; date: string; version: string; interventions: AnIntervention[] } {
  const uid = xml.match(/<uid>([^<]+)<\/uid>/)?.[1] ?? "";
  const raw = xml.match(/<dateSeance>(\d{8})(\d{4})?/);
  const date = raw ? `${raw[1].slice(0, 4)}-${raw[1].slice(4, 6)}-${raw[1].slice(6, 8)}T${(raw[2] ?? "0000").slice(0, 2)}:${(raw[2] ?? "0000").slice(2, 4)}:00` : "";
  const version = xml.match(/<version>([^<]*)<\/version>/)?.[1] ?? "";
  const interventions: AnIntervention[] = [];
  const stack: PointCtx[] = [];
  const re = /<(point|\/point|paragraphe|\/paragraphe)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const [full, tag, attrs] = m;
    if (tag === "point") {
      // Titre du point : premier <texte> avant le premier <paragraphe>
      const after = xml.slice(m.index + full.length, m.index + full.length + 4000);
      const tx = after.match(/<texte[^>]*>([\s\S]*?)<\/texte>/);
      const firstPara = after.indexOf("<paragraphe");
      const title = tx && (firstPara === -1 || (tx.index ?? 0) < firstPara) ? cleanSyceronText(tx[1]).replace(/\s+/g, " ") : "";
      stack.push({ code: attr(attrs, "code_grammaire") ?? "", title });
    } else if (tag === "/point") {
      stack.pop();
    } else if (tag === "paragraphe") {
      const end = xml.indexOf("</paragraphe>", m.index);
      if (end === -1) break;
      const inner = xml.slice(m.index + full.length, end);
      re.lastIndex = end;
      const code = attr(attrs, "code_grammaire") ?? "";
      const acteur = attr(attrs, "id_acteur");
      if (!acteur || !acteur.startsWith("PA")) continue;
      if (attr(attrs, "roledebat") === "president") continue;
      if (/^INTERRUPTION|^RAP_REGLEMENT|^SUSP_SEANCE|^OUV_SEAN|^FIN_SEAN|^ODJ_|^SCRUT_|^ANN_SCR|^ADOP_ADT|^REJET_ADT|^RETRAIT_ADT|^SORT_|^ADT_SORTS|^AM8ENDSORT/.test(code)) continue;
      const nom = inner.match(/<nom>([^<]*)<\/nom>/)?.[1] ?? "";
      if (/pr[ée]sident/i.test(nom) && !/^(M\.|Mme) [A-ZÉ]/.test(nom)) continue; // « Mme la présidente »
      const tx = inner.match(/<texte[^>]*>([\s\S]*?)<\/texte>/);
      if (!tx) continue;
      const text = cleanSyceronText(tx[1]);
      const kind = kindFor(stack);
      if (text.length < (MIN_CHARS[kind] ?? 400)) continue;
      interventions.push({
        id: `an-cri:${uid}:${attr(attrs, "id_syceron") ?? interventions.length}`,
        acteurId: acteur,
        speaker: decodeEntities(nom).replace(/^(M\.|Mme)\s+/, ""),
        kind,
        title: titleFor(stack, kind),
        text,
        order: Number(attr(attrs, "ordre_absolu_seance") ?? 0),
      });
    }
  }
  return { uid, date, version, interventions };
}

/** Importe (incrémentalement) les comptes rendus de la législature. */
export async function ingestAnComptesRendus(ctx: JobContext) {
  const db = getDb();
  const sqlite = getSqlite();
  ctx.log(`Assemblée nationale — comptes rendus de séance (législature ${AN_LEGISLATURE})`);
  const buf = await fetchCached(AN_CRI_URL, { log: ctx.log });
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name.endsWith(".xml") });
  const names = Object.keys(files).sort();
  ctx.log(`${names.length} comptes rendus dans le dump`);
  const crUrls = anCrUrls(names.map((n) => crMeta(strFromU8(files[n].subarray(0, 3000)))).filter((m): m is CrMeta => m !== null));
  const setUrl = sqlite.prepare(`UPDATE posts SET url = ? WHERE source = 'an-cri' AND source_ref = ? AND url != ?`);
  sqlite.transaction(() => {
    for (const [uid, url] of crUrls) setUrl.run(url, uid, url);
  })();

  const seenRow = sqlite.prepare(`SELECT value FROM settings WHERE key = 'an-cri:seen'`).get() as { value: string } | undefined;
  const seen: Record<string, string> = seenRow ? (JSON.parse(seenRow.value) as Record<string, string>) : {};
  const deputies = new Map(
    (sqlite.prepare(`SELECT id, party_id AS partyId, full_name AS fullName FROM politicians WHERE chamber = 'AN'`).all() as { id: string; partyId: string | null; fullName: string }[]).map((p) => [p.id, p]),
  );
  const insert = sqlite.prepare(
    `INSERT OR IGNORE INTO posts (id, handle, party_id, politician_id, kind, title, chamber, source_ref, text, created_at, url, likes, reposts, replies, views, source, ingested_at)
     VALUES (@id, @handle, @partyId, @politicianId, @kind, @title, 'AN', @sourceRef, @text, @createdAt, @url, 0, 0, 0, 0, 'an-cri', @now)`,
  );
  const purge = sqlite.prepare(`DELETE FROM posts WHERE source = 'an-cri' AND source_ref = ? AND id NOT IN (SELECT post_id FROM post_analyses)`);

  let processed = 0;
  let inserted = 0;
  let skippedUnknown = 0;
  const byKind: Record<string, number> = {};
  ctx.setProgress(0, names.length);
  let i = 0;
  for (const name of names) {
    ctx.checkpoint();
    const xml = strFromU8(files[name]);
    delete files[name];
    const cr = parseCompteRendu(xml);
    i++;
    if (!cr.uid || !cr.date) continue;
    if (seen[cr.uid] === cr.version) continue; // déjà importé dans cette version
    processed++;
    const url = crUrls.get(cr.uid) ?? `https://www.assemblee-nationale.fr/dyn/${AN_LEGISLATURE}/comptes-rendus/seance/${cr.uid}`;
    sqlite.transaction(() => {
      if (seen[cr.uid]) purge.run(cr.uid); // nouvelle version du CR : on remplace ce qui n'a pas encore été analysé
      for (const it of cr.interventions) {
        const dep = deputies.get(it.acteurId);
        if (!dep) {
          skippedUnknown++;
          continue;
        }
        const r = insert.run({
          id: it.id,
          handle: dep.fullName,
          partyId: dep.partyId,
          politicianId: dep.id,
          kind: it.kind,
          title: it.title || null,
          sourceRef: cr.uid,
          text: it.text,
          createdAt: cr.date.slice(0, 19),
          url,
          now: nowIso(),
        });
        if (r.changes) {
          inserted++;
          byKind[it.kind] = (byKind[it.kind] ?? 0) + 1;
        }
      }
    })();
    seen[cr.uid] = cr.version;
    if (processed % 25 === 0) ctx.setProgress(i, names.length, `${inserted} interventions importées`);
  }
  db.insert(schema.settings)
    .values({ key: "an-cri:seen", value: JSON.stringify(seen), updatedAt: nowIso() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: JSON.stringify(seen), updatedAt: nowIso() } })
    .run();
  ctx.setProgress(names.length, names.length, `${inserted} interventions importées`);
  ctx.log(
    `${processed} comptes rendus nouveaux ou mis à jour, ${inserted} interventions de députés retenues (${Object.entries(byKind)
      .map(([k, n]) => `${KIND_LABEL[k] ?? k} : ${n}`)
      .join(", ") || "aucune"})${skippedUnknown ? ` — ${skippedUnknown} interventions d'acteurs hors base (ministres, anciens députés) ignorées` : ""}`,
  );
}

/* ------------------------------------------------------------------ */
/* Adresse lisible d'un compte rendu sur assemblee-nationale.fr        */
/* ------------------------------------------------------------------ */

/**
 * L'adresse par identifiant (…/seance/CRSANR5L17S2026O1N188) passe par une redirection
 * qui échoue souvent (erreur 500) ; on construit directement l'adresse finale :
 * …/seance/session-ordinaire-de-2025-2026/deuxieme-seance-du-mardi-31-mars-2026
 */
export interface CrMeta {
  uid: string;
  sessionRef: string; // SCR5A2026O1
  dayKey: string; // 20260331
  dayLabel: string; // « mardi 31 mars 2026 »
  numJour: number;
}

export function crMeta(xml: string): CrMeta | null {
  const head = xml.slice(0, 3000);
  const uid = head.match(/<uid>([^<]+)<\/uid>/)?.[1];
  const sessionRef = head.match(/<sessionRef>([^<]+)<\/sessionRef>/)?.[1];
  const dayKey = head.match(/<dateSeance>(\d{8})/)?.[1];
  const dayLabel = head.match(/<dateSeanceJour>([^<]+)<\/dateSeanceJour>/)?.[1];
  const numJour = Number(head.match(/<numSeanceJour>(\d+)<\/numSeanceJour>/)?.[1] ?? 0);
  if (!uid || !sessionRef || !dayKey || !dayLabel) return null;
  return { uid, sessionRef, dayKey, dayLabel, numJour };
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const ORDINAL = ["", "premiere", "deuxieme", "troisieme", "quatrieme", "cinquieme"];

/** uid du compte rendu → adresse finale (ou adresse par identifiant si le format est inconnu). */
export function anCrUrls(metas: CrMeta[]): Map<string, string> {
  // Jours récents : d'autres séances du même jour peuvent encore être publiées, ce qui change le nom de la page.
  const newest = metas.reduce((a, m) => (m.dayKey > a ? m.dayKey : a), "");
  const recent = new Date(Date.parse(`${newest.slice(0, 4)}-${newest.slice(4, 6)}-${newest.slice(6, 8)}`) - 7 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
  const perDay = new Map<string, number>();
  for (const m of metas) perDay.set(m.dayKey, (perDay.get(m.dayKey) ?? 0) + 1);
  const out = new Map<string, string>();
  for (const m of metas) {
    const base = `https://www.assemblee-nationale.fr/dyn/${AN_LEGISLATURE}/comptes-rendus/seance`;
    const s = m.sessionRef.match(/^SCR5A(\d{4})([OE])(\d)$/);
    const ord = ORDINAL[m.numJour];
    if (!s || m.dayKey >= recent || (perDay.get(m.dayKey)! > 1 && !ord)) {
      out.set(m.uid, `${base}/${m.uid}`);
      continue;
    }
    const y = Number(s[1]);
    const years = `${y - 1}-${y}`;
    const session = s[2] === "O" ? `session-ordinaire-de-${years}` : `${s[3] === "1" ? "" : `${s[3]}e-`}session-extraordinaire-de-${years}`;
    const seance = perDay.get(m.dayKey)! > 1 ? `${ord}-seance-du-${slug(m.dayLabel)}` : `seance-du-${slug(m.dayLabel)}`;
    out.set(m.uid, `${base}/${session}/${seance}`);
  }
  return out;
}
