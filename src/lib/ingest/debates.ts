import crypto from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { getSqlite, nowIso } from "../db";
import type { DebateTurn } from "../db/schema";
import { fetchCached } from "./fetch-cache";
import { AN_LEGISLATURE } from "./an";
import { AN_CRI_URL, anCrUrls, cleanSyceronText, crMeta, type CrMeta } from "./cri-an";
import { SENAT_CRI_URL, normalizeName } from "./cri-senat";
import { SENAT_MIN_DATE } from "./senat";
import type { JobContext } from "../jobs";

/**
 * Rattache chaque scrutin au passage du compte rendu officiel qui le précède :
 * présentation de l'amendement ou de l'article, avis de la commission et du
 * gouvernement, interventions, explications de vote. C'est là que les élus disent
 * pourquoi ils votent pour ou contre — ce que l'intitulé du scrutin ne dit pas.
 *
 *  - AN : les résultats annoncés en séance (« Voici le résultat du scrutin… ») sont
 *    appariés aux scrutins du jour par leurs décomptes (pour / contre), dans l'ordre.
 *  - Sénat : le compte rendu donne le numéro du scrutin (« résultat du scrutin n° 334 »).
 *
 * Le passage retenu remonte depuis « Je mets aux voix » jusqu'à la décision précédente
 * (vote d'un autre amendement) ; pour un amendement en discussion commune, on remonte
 * jusqu'à sa présentation. Gratuit, idempotent : un passage inchangé n'est pas réécrit,
 * un passage modifié (nouvelle version du compte rendu) invalide son explication.
 */

type Role = DebateTurn["role"];

interface Para {
  kind: "speech" | "decision" | "result" | "stop" | "noise";
  speakerKey: string; // id d'acteur AN ou nom normalisé Sénat
  speaker: string;
  quality: string | null;
  role: Role;
  raw: string; // texte brut, didascalies comprises (détection des décisions)
  text: string; // texte nettoyé
  amendNum: string | null; // AN : n° de l'amendement mis aux voix (attribut valeur)
  counts?: { votants: number | null; pour: number | null; contre: number | null };
  senatNumber?: number;
  anchor?: string;
}

const MAX_TURN = 3000;
const MAX_TOTAL = 24000;
const BACK_LIMIT = 300;

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
const stripTags = (s: string) => decode(s.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const attr = (tag: string, name: string): string | null => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;

const DECISION_RE = /^\(?\s*(L[’']|Les |La |Le )[^()]{0,250}\b(est|sont|n[’']est pas|ne sont pas)\s+(successivement\s+)?(adopt|rejet|retir|repouss)/i;
const RESULT_RE = /r[ée]sultat du scrutin/i;

function roleFromQuality(quality: string | null, fallback: Role): Role {
  const q = (quality ?? "").toLowerCase();
  if (/ministre|secr[ée]taire d.[ée]tat|garde des sceaux/.test(q)) return "gouvernement";
  if (/rapporteu|pr[ée]sident(e)? de la commission/.test(q)) return "commission";
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Assemblée nationale                                                 */
/* ------------------------------------------------------------------ */

function parseCounts(raw: string) {
  const n = (re: RegExp) => {
    const m = raw.match(re);
    return m ? Number(m[1]) : null;
  };
  return {
    votants: n(/votants\s*(\d+)/i),
    pour: n(/pour l[’']adoption\s*(\d+)/i) ?? n(/\bpour\s*(\d+)/i),
    contre: n(/contre\s*(\d+)/i),
  };
}

export function flattenAn(xml: string): Para[] {
  const out: Para[] = [];
  for (const m of xml.matchAll(/<paragraphe\b([^>]*)>([\s\S]*?)<\/paragraphe>/g)) {
    const [, attrs, inner] = m;
    const code = attr(attrs, "code_grammaire") ?? "";
    const acteur = attr(attrs, "id_acteur") ?? "";
    const tx = inner.match(/<texte[^>]*>([\s\S]*?)<\/texte>/)?.[1] ?? "";
    const raw = stripTags(tx);
    const nom = decode(inner.match(/<nom>([^<]*)<\/nom>/)?.[1] ?? "");
    const quality = decode(inner.match(/<qualite>([^<]*)<\/qualite>/)?.[1] ?? "") || null;
    const president = attr(attrs, "roledebat") === "president" || /^(M\.|Mme) (le|la) pr[ée]sident/i.test(nom);
    let kind: Para["kind"] = "speech";
    if (RESULT_RE.test(raw)) kind = "result";
    else if (/^(ODJ_|QG_|QOSD_|OUV_SEAN|FIN_SEAN|TITRE_TEXTE_DISCUSSION)/.test(code)) kind = "stop";
    else if (/^(ADOP_|REJET_|SORT_|RETRAIT_|ADT_SORT|AM8ENDSORT)/.test(code) || /^SCRUT_.*_1_5$/.test(code) || (!acteur && DECISION_RE.test(raw))) kind = "decision";
    else if (/^(INTERRUPTION|RAP_REGLEMENT|SUSP_SEAN)/.test(code) || !acteur) kind = "noise";
    out.push({
      kind,
      speakerKey: acteur,
      speaker: president ? "La présidence" : nom.replace(/^(M\.|Mme)\s+/, ""),
      quality,
      role: president ? "presidence" : roleFromQuality(quality, "parlementaire"),
      raw,
      text: kind === "speech" ? cleanSyceronText(tx) : raw,
      amendNum: attr(attrs, "valeur")?.trim() || null,
      counts: kind === "result" ? parseCounts(raw) : undefined,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Sénat                                                               */
/* ------------------------------------------------------------------ */

const prettyName = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => (w.length > 1 && w === w.toUpperCase() ? w.charAt(0) + w.slice(1).toLowerCase().replace(/([-’'])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : w))
    .join(" ");

export function flattenSenat(xhtml: string): Para[] {
  const out: Para[] = [];
  const stop = (title: string) => out.push({ kind: "stop", speakerKey: "", speaker: "", quality: null, role: "presidence", raw: title, text: title, amendNum: null });
  const outer = /<cri:intervenant\b([^>]*)>([\s\S]*?)<\/cri:intervenant>|<cri:titreS1\b[^>]*>([\s\S]*?)<\/cri:titreS1>/g;
  for (const m of xhtml.matchAll(outer)) {
    if (m[3] !== undefined) {
      const t = stripTags(m[3]);
      if (t && !/^pr[ée]sidence de/i.test(t)) stop(t);
      continue;
    }
    const attrs = m[1];
    const type = attr(attrs, "type");
    const nom = decode(attr(attrs, "nom") ?? "");
    const qua = decode(attr(attrs, "qua") ?? "") || null;
    const president = /pr[ée]sident(e)? de s[ée]ance/i.test(qua ?? "") || /^pr[ée]sident(e)?$/i.test(qua ?? "");
    const role: Role = president ? "presidence" : type === "2" ? "gouvernement" : roleFromQuality(qua, "parlementaire");
    const inner = m[2];
    for (const t of inner.matchAll(/<cri:titreS1\b[^>]*>([\s\S]*?)<\/cri:titreS1>|<cri:amendements>([\s\S]*?)<\/cri:amendements>|<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
      if (t[1] !== undefined) {
        const title = stripTags(t[1]);
        if (title && !/^pr[ée]sidence de/i.test(title)) stop(title);
        continue;
      }
      if (t[2] !== undefined) {
        const text = stripTags(t[2]);
        if (text) out.push({ kind: "speech", speakerKey: "amendement", speaker: "Texte de l'amendement", quality: null, role: "amendement", raw: text, text, amendNum: null });
        continue;
      }
      const spoken = t[4].match(/<cri:orateurqualite>([\s\S]*?)<\/cri:orateurqualite>/)?.[1];
      const body = t[4].replace(/<span class="orateur_nom">[\s\S]*?<\/cri:orateurnom><\/span>/g, "").replace(/<span class="orateur_qualite">[\s\S]*?<\/cri:orateurqualite><\/span>/g, "");
      const quality = (spoken ? stripTags(spoken).replace(/[.\s]+$/, "") : "") || qua;
      const raw = stripTags(body);
      if (!raw) continue;
      const text = stripTags(body.replace(/<cri:infoentreparentheses>[\s\S]*?<\/cri:infoentreparentheses>/g, " "));
      const res = raw.match(/r[ée]sultat du scrutin n[°o]\s*(\d+)/i);
      let kind: Para["kind"] = "speech";
      if (res) kind = "result";
      else if (DECISION_RE.test(raw) || /^Le Sénat a adopt|^Le Sénat n.a pas adopt/.test(raw)) kind = "decision";
      else if (!text) kind = "noise";
      out.push({
        kind,
        speakerKey: normalizeName(nom),
        speaker: president ? "La présidence" : prettyName(nom),
        quality,
        role: role === "parlementaire" ? roleFromQuality(quality, role) : role,
        raw,
        text,
        amendNum: null,
        senatNumber: res ? Number(res[1]) : undefined,
        anchor: attr(t[3], "id") ?? undefined,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Fenêtre de débat                                                    */
/* ------------------------------------------------------------------ */

const KEEP_PRESIDENCE = /soutenir|mets aux voix|amendement|identiques|scrutin public|explications? de vote|article/i;

/** Indices [start, end] du passage qui précède le résultat d'indice `r`. */
function windowFor(paras: Para[], r: number): [number, number] {
  let end = r;
  for (let k = r - 1; k >= Math.max(0, r - 12); k--) {
    if (/mets aux voix/i.test(paras[k].raw)) {
      end = k;
      break;
    }
    if (paras[k].kind === "result" || paras[k].kind === "stop") break;
  }
  let start = end;
  for (let j = end - 1; j >= Math.max(0, end - BACK_LIMIT); j--) {
    const k = paras[j].kind;
    if (k === "stop" || k === "decision" || k === "result") break;
    start = j;
  }
  // Discussion commune : l'amendement a été présenté avant le vote des précédents.
  const num = paras[end].amendNum ?? paras[end].raw.match(/amendements?\s+n[os°]*\s*(\d+)/i)?.[1] ?? null;
  const substantive = paras.slice(start, end).filter((p) => p.kind === "speech" && p.role !== "presidence" && p.text.length > 200).length;
  if (num && substantive < 2) {
    const re = new RegExp(`amendements?[^.]{0,120}\\b${num}\\b`, "i");
    for (let j = start - 1; j >= Math.max(0, start - BACK_LIMIT); j--) {
      if (paras[j].kind === "stop") break;
      if (re.test(paras[j].raw)) start = j;
    }
  }
  return [start, end];
}

interface Resolver {
  (p: Para): { politicianId: string | null; groupRef: string | null; group: string | null; fullName: string | null };
}

function buildTurns(paras: Para[], start: number, end: number, resolve: Resolver): DebateTurn[] {
  const turns: DebateTurn[] = [];
  for (let i = start; i <= end; i++) {
    const p = paras[i];
    if (p.kind !== "speech" || !p.text) continue;
    if (p.role === "presidence" && !KEEP_PRESIDENCE.test(p.text)) continue;
    const prev = turns[turns.length - 1];
    if (prev && prev.speaker === p.speaker && prev.role === p.role) {
      prev.text += `\n${p.text}`;
      continue;
    }
    const who = p.role === "presidence" || p.role === "amendement" ? null : resolve(p);
    turns.push({
      speaker: who?.fullName ?? p.speaker,
      politicianId: who?.politicianId ?? null,
      groupRef: p.role === "gouvernement" ? null : (who?.groupRef ?? null),
      group: p.role === "gouvernement" ? null : (who?.group ?? null),
      role: p.role,
      quality: p.quality,
      text: p.role === "presidence" && p.text.length > 500 ? `${p.text.slice(0, 500).replace(/\s+\S*$/, "")} […]` : p.text,
    });
  }
  // Plafonds : chaque intervention, puis l'ensemble.
  let cap = MAX_TURN;
  while (cap > 400 && turns.reduce((s, t) => s + Math.min(t.text.length, cap), 0) > MAX_TOTAL) cap -= 200;
  for (const t of turns) if (t.text.length > cap) t.text = `${t.text.slice(0, cap).replace(/\s+\S*$/, "")} […]`;
  return turns;
}

/* ------------------------------------------------------------------ */
/* Job                                                                 */
/* ------------------------------------------------------------------ */

interface ScrutinRow {
  uid: string;
  number: string;
  date: string;
  pour: number | null;
  contre: number | null;
  votants: number | null;
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export async function linkDebates(ctx: JobContext) {
  const sqlite = getSqlite();
  const existing = new Map((sqlite.prepare(`SELECT scrutin_uid AS uid, hash, url FROM scrutin_debates`).all() as { uid: string; hash: string; url: string | null }[]).map((r) => [r.uid, r]));
  const setUrl = sqlite.prepare(`UPDATE scrutin_debates SET url = ? WHERE scrutin_uid = ?`);
  const insert = sqlite.prepare(
    `INSERT INTO scrutin_debates (scrutin_uid, source, cr_ref, url, turns, hash, extracted_at) VALUES (@uid, @source, @crRef, @url, @turns, @hash, @now)
     ON CONFLICT(scrutin_uid) DO UPDATE SET source=excluded.source, cr_ref=excluded.cr_ref, url=excluded.url, turns=excluded.turns, hash=excluded.hash, extracted_at=excluded.extracted_at, explanation=NULL, explain_model=NULL, explained_at=NULL`,
  );
  let written = 0;
  let unchanged = 0;
  const save = (uid: string, source: string, crRef: string, url: string, turns: DebateTurn[]) => {
    if (!turns.some((t) => t.role !== "presidence")) return;
    const json = JSON.stringify(turns);
    const hash = crypto.createHash("sha1").update(json).digest("hex").slice(0, 16);
    const prev = existing.get(uid);
    if (prev?.hash === hash) {
      if (prev.url !== url) setUrl.run(url, uid); // seule l'adresse du compte rendu a changé : l'explication reste valable
      unchanged++;
      return;
    }
    insert.run({ uid, source, crRef, url, turns: json, hash, now: nowIso() });
    existing.set(uid, { uid, hash, url });
    written++;
  };

  /* ---- Assemblée nationale ---- */
  ctx.log("Débats AN : rattachement des scrutins aux comptes rendus de séance");
  const deputies = new Map(
    (sqlite.prepare(`SELECT id, full_name AS fullName, group_ref AS groupRef, group_abbrev AS groupAbbrev FROM politicians WHERE chamber = 'AN'`).all() as { id: string; fullName: string; groupRef: string | null; groupAbbrev: string | null }[]).map((p) => [p.id, p]),
  );
  const anByDate = new Map<string, ScrutinRow[]>();
  for (const s of sqlite.prepare(`SELECT uid, number, date, pour, contre, votants FROM scrutins WHERE chamber = 'AN'`).all() as ScrutinRow[]) {
    const list = anByDate.get(s.date) ?? [];
    list.push(s);
    anByDate.set(s.date, list);
  }
  for (const list of anByDate.values()) list.sort((a, b) => Number(a.number) - Number(b.number));
  const resolveAn: Resolver = (p) => {
    const d = deputies.get(p.speakerKey);
    return { politicianId: d?.id ?? null, groupRef: d?.groupRef ?? null, group: d?.groupAbbrev ?? null, fullName: d?.fullName ?? null };
  };

  const buf = await fetchCached(AN_CRI_URL, { log: ctx.log });
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name.endsWith(".xml") });
  const crs: { uid: string; date: string; time: string; xml: string }[] = [];
  for (const [name, data] of Object.entries(files)) {
    const xml = strFromU8(data);
    delete files[name];
    const uid = xml.match(/<uid>([^<]+)<\/uid>/)?.[1];
    const raw = xml.match(/<dateSeance>(\d{8})(\d{4})?/);
    if (!uid || !raw) continue;
    crs.push({ uid, date: `${raw[1].slice(0, 4)}-${raw[1].slice(4, 6)}-${raw[1].slice(6, 8)}`, time: raw[2] ?? "0000", xml });
  }
  crs.sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
  const crUrls = anCrUrls(crs.map((c) => crMeta(c.xml)).filter((m): m is CrMeta => m !== null));
  const matched = new Set<string>();
  const lastNumber = new Map<string, number>(); // par date de séance : dernier n° apparié (ordre chronologique)
  let anResults = 0;
  let anMatched = 0;
  ctx.setProgress(0, crs.length, "Assemblée nationale…");
  crs.forEach((cr, idx) => {
    ctx.checkpoint();
    const paras = flattenAn(cr.xml);
    cr.xml = "";
    const url = crUrls.get(cr.uid) ?? `https://www.assemblee-nationale.fr/dyn/${AN_LEGISLATURE}/comptes-rendus/seance/${cr.uid}`;
    paras.forEach((p, r) => {
      if (p.kind !== "result" || !p.counts || p.counts.pour === null || p.counts.contre === null) return;
      anResults++;
      const after = lastNumber.get(cr.date) ?? 0;
      const candidates = [...(anByDate.get(cr.date) ?? []), ...(anByDate.get(addDays(cr.date, 1)) ?? [])];
      const s = candidates.find((c) => !matched.has(c.uid) && Number(c.number) > after && c.pour === p.counts!.pour && c.contre === p.counts!.contre && (p.counts!.votants === null || c.votants === null || c.votants === p.counts!.votants));
      if (!s) return;
      matched.add(s.uid);
      lastNumber.set(cr.date, Number(s.number));
      anMatched++;
      const [start, end] = windowFor(paras, r);
      save(s.uid, "an-cri", cr.uid, url, buildTurns(paras, start, end, resolveAn));
    });
    if (idx % 50 === 0) ctx.setProgress(idx, crs.length, `AN : ${anMatched} scrutins rattachés`);
  });
  ctx.log(`AN : ${anResults} résultats de scrutin lus dans ${crs.length} comptes rendus, ${anMatched} rattachés à un scrutin`);

  /* ---- Sénat ---- */
  try {
    ctx.log("Débats Sénat : rattachement des scrutins aux comptes rendus intégraux");
    const senators = new Map<string, { id: string; fullName: string; groupRef: string | null; groupAbbrev: string | null }>();
    for (const s of sqlite.prepare(`SELECT id, full_name AS fullName, first_name AS firstName, last_name AS lastName, group_ref AS groupRef, group_abbrev AS groupAbbrev FROM politicians WHERE chamber = 'SENAT'`).all() as { id: string; fullName: string; firstName: string; lastName: string; groupRef: string | null; groupAbbrev: string | null }[]) {
      senators.set(normalizeName(s.fullName), s);
      senators.set(normalizeName(`${s.lastName} ${s.firstName}`), s);
    }
    const resolveSen: Resolver = (p) => {
      const d = senators.get(p.speakerKey);
      return { politicianId: d?.id ?? null, groupRef: d?.groupRef ?? null, group: d?.groupAbbrev ?? null, fullName: d?.fullName ?? null };
    };
    const senScrutins = new Map((sqlite.prepare(`SELECT uid, number, date, pour, contre, votants FROM scrutins WHERE chamber = 'SENAT'`).all() as ScrutinRow[]).map((s) => [s.uid, s]));
    const minName = `cri/d${SENAT_MIN_DATE.replace(/-/g, "")}.xml`;
    const sbuf = await fetchCached(SENAT_CRI_URL, { log: ctx.log, maxAgeHours: 20 });
    const sfiles = unzipSync(new Uint8Array(sbuf), { filter: (f) => /^cri\/d\d{8}\.xml$/.test(f.name) && f.name >= minName });
    const names = Object.keys(sfiles).sort();
    const decoder = new TextDecoder("iso-8859-1");
    let senMatched = 0;
    ctx.setProgress(0, names.length, "Sénat…");
    names.forEach((name, idx) => {
      ctx.checkpoint();
      const xhtml = decoder.decode(sfiles[name]);
      delete sfiles[name];
      const day = name.slice(5, 13);
      const date = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
      const session = Number(day.slice(4, 6)) >= 10 ? Number(day.slice(0, 4)) : Number(day.slice(0, 4)) - 1;
      const paras = flattenSenat(xhtml);
      paras.forEach((p, r) => {
        if (p.kind !== "result" || !p.senatNumber) return;
        const s = senScrutins.get(`SEN-${session}-${p.senatNumber}`);
        if (!s || Math.abs(Date.parse(s.date) - Date.parse(date)) > 3 * 86400000) return;
        const [start, end] = windowFor(paras, r);
        const anchor = paras.slice(start, end + 1).find((x) => x.anchor)?.anchor;
        const url = `https://www.senat.fr/seances/s${day.slice(0, 6)}/s${day}/s${day}_mono.html${anchor ? `#${anchor}` : ""}`;
        senMatched++;
        save(s.uid, "senat-cri", name, url, buildTurns(paras, start, end, resolveSen));
      });
      if (idx % 20 === 0) ctx.setProgress(idx, names.length, `Sénat : ${senMatched} scrutins rattachés`);
    });
    ctx.log(`Sénat : ${senMatched} scrutins rattachés sur ${senScrutins.size}`);
  } catch (e) {
    ctx.log(`Sénat ignoré : ${(e as Error).message}`);
  }
  ctx.log(`Débats : ${written} passages écrits ou mis à jour, ${unchanged} inchangés`);
}
