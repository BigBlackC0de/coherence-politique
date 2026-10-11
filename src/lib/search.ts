import { getSqlite } from "./db";
import { THEMES } from "./config/themes";
import { THEME_PLAIN } from "./config/plain";

/**
 * Recherche globale (page /recherche).
 *
 * Insensibilité aux accents et à la casse — approche retenue :
 * SQLite `LIKE` n'ignore la casse que pour l'ASCII et ne connaît pas les accents, et une table FTS5
 * demanderait une migration du schéma. On normalise donc la requête (NFD sans diacritiques,
 * minuscules), puis chaque mot devient un motif `GLOB` dont chaque lettre est une classe de
 * caractères couvrant ses variantes accentuées et majuscules :
 *   « retraites » → *[rR][eéèêëEÉÈÊË][tT][rR][aàâäAÀÂÄ][iîïIÎÏ][tT][eéèêëEÉÈÊË][sS]*
 * Tout reste exécuté en C par SQLite (pas de fonction JS appelée ligne à ligne) : ~0,5 s pour
 * balayer les 90 Mo de texte des prises de parole dans le pire cas (mot rare), bien moins pour un
 * mot fréquent car la requête parcourt l'index par date et s'arrête au plafond.
 * Limites : les ligatures (« œ » ≠ « oe ») ne sont pas rapprochées ; pas de racinisation
 * (« retraite » trouve « retraites », mais pas l'inverse) ; plusieurs mots = tous requis (ET).
 */

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

/** Minuscule sans accent, en conservant la longueur (un caractère → un caractère). */
export function foldChar(ch: string): string {
  if (ch === "’" || ch === "‘") return "'";
  return (ch.normalize("NFD")[0] ?? ch).toLowerCase();
}

export function fold(s: string): string {
  let out = "";
  for (const ch of s) out += foldChar(ch);
  return out;
}

const VARIANTS: Record<string, string> = {
  a: "aàâäáãAÀÂÄÁÃ",
  e: "eéèêëEÉÈÊË",
  i: "iîïíìIÎÏÍÌ",
  o: "oôöóòõOÔÖÓÒÕ",
  u: "uùûüúUÙÛÜÚ",
  c: "cçCÇ",
  y: "yÿYŸ",
  n: "nñNÑ",
  "'": "'’‘",
};

/** Motif GLOB (insensible à la casse et aux accents) pour un mot déjà normalisé par `fold`. */
function globPattern(word: string): string {
  let p = "*";
  for (const ch of word) {
    if (VARIANTS[ch]) p += `[${VARIANTS[ch]}]`;
    else if (/[a-z]/.test(ch)) p += `[${ch}${ch.toUpperCase()}]`;
    else if (ch === "*" || ch === "?" || ch === "[") p += `[${ch}]`;
    else p += ch;
  }
  return p + "*";
}

const STOPWORDS = new Set(["le", "la", "les", "de", "des", "du", "un", "une", "et", "en", "au", "aux", "pour", "sur", "par", "dans", "avec", "qui", "que", "ou", "est", "ce", "ces", "se", "sa", "son", "ses", "l", "d"]);

/** Découpe la requête en mots normalisés (au plus 6). Les mots vides sont ignorés s'il reste autre chose. */
export function searchWords(q: string): string[] {
  const raw = fold(q.trim())
    .split(/[\s']+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((w) => w.length >= 2 || /\d/.test(w));
  const meaningful = raw.filter((w) => !STOPWORDS.has(w));
  return [...new Set(meaningful.length ? meaningful : raw)].slice(0, 6);
}

/** Condition SQL « chaque mot apparaît dans au moins une des colonnes ». */
function wordConds(words: string[], cols: string[]): { sql: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  for (const w of words) {
    const pat = globPattern(w);
    parts.push(`(${cols.map((c) => `COALESCE(${c}, '') GLOB ?`).join(" OR ")})`);
    for (let i = 0; i < cols.length; i++) params.push(pat);
  }
  return { sql: parts.join(" AND ") || "1=1", params };
}

/* ------------------------------------------------------------------ */
/* Extraits et surlignage                                              */
/* ------------------------------------------------------------------ */

export interface Segment {
  text: string;
  hit: boolean;
}

/** Découpe `text` en segments, les occurrences des mots (insensibles casse/accents) marquées `hit`. */
export function highlight(text: string, words: string[]): Segment[] {
  if (!text) return [];
  const chars = [...text];
  const folded = chars.map(foldChar).join("");
  const marks = new Array<boolean>(chars.length).fill(false);
  for (const w of words) {
    let from = 0;
    for (;;) {
      const i = folded.indexOf(w, from);
      if (i < 0) break;
      for (let k = i; k < i + [...w].length; k++) marks[k] = true;
      from = i + 1;
    }
  }
  const out: Segment[] = [];
  for (let i = 0; i < chars.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === marks[i]) last.text += chars[i];
    else out.push({ text: chars[i], hit: marks[i] });
  }
  return out;
}

/** Extrait d'environ `len` caractères centré sur la première occurrence d'un des mots. */
export function snippet(text: string, words: string[], len = 240): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const chars = [...clean];
  if (chars.length <= len) return clean;
  const folded = chars.map(foldChar).join("");
  let pos = -1;
  for (const w of words) {
    const i = folded.indexOf(w);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  let start = pos < 0 ? 0 : Math.max(0, pos - Math.floor(len / 3));
  if (start > 0) {
    const sp = clean.indexOf(" ", start);
    if (sp > 0 && sp - start < 20) start = sp + 1;
  }
  const end = Math.min(chars.length, start + len);
  return `${start > 0 ? "… " : ""}${chars.slice(start, end).join("").trim()}${end < chars.length ? " …" : ""}`;
}

/* ------------------------------------------------------------------ */
/* Recherche                                                           */
/* ------------------------------------------------------------------ */

export interface SearchGroup<T> {
  /** Nombre total de résultats (plafonné à `cap` pour les prises de parole). */
  total: number;
  /** Vrai si `total` est un plafond (il y en a au moins autant). */
  capped: boolean;
  items: T[];
}

export interface PoliticianHit {
  id: string;
  fullName: string;
  chamber: string;
  department: string | null;
  groupAbbrev: string | null;
  active: boolean;
  partyId: string | null;
  partyShort: string | null;
  partyColor: string | null;
}
export interface PartyHit {
  id: string;
  name: string;
  shortName: string;
  color: string;
  family: string;
  leaders: string[];
}
export interface ScrutinHit {
  uid: string;
  date: string;
  chamber: string;
  title: string;
  sort: string | null;
  summary: string | null;
  salience: number | null;
  theme: string | null;
}
export interface ThemeHit {
  id: string;
  label: string;
  emoji: string;
  question: string;
  examples: string;
}
export interface PostHit {
  id: string;
  handle: string;
  kind: string;
  title: string | null;
  chamber: string | null;
  createdAt: string;
  url: string | null;
  politicianId: string | null;
  partyId: string | null;
  partyShort: string | null;
  partyColor: string | null;
  excerpt: string;
}
export interface ProgrammeHit {
  id: number;
  title: string;
  kind: string;
  status: string;
  partyId: string;
  partyShort: string | null;
  partyColor: string | null;
  /** Thèmes dont l'analyse mentionne la recherche. */
  themes: string[];
  excerpt: string | null;
}

export interface SearchResults {
  query: string;
  words: string[];
  politicians: SearchGroup<PoliticianHit>;
  parties: SearchGroup<PartyHit>;
  scrutins: SearchGroup<ScrutinHit>;
  themes: SearchGroup<ThemeHit>;
  posts: SearchGroup<PostHit>;
  programmes: SearchGroup<ProgrammeHit>;
}

const empty = <T>(): SearchGroup<T> => ({ total: 0, capped: false, items: [] });

export function globalSearch(query: string, opts?: { limit?: number; postsCap?: number }): SearchResults {
  const words = searchWords(query);
  const base: SearchResults = { query, words, politicians: empty(), parties: empty(), scrutins: empty(), themes: empty(), posts: empty(), programmes: empty() };
  if (!words.length) return base;
  const limit = opts?.limit ?? 8;
  return {
    ...base,
    politicians: searchPoliticiansGlobal(words, limit + 4),
    parties: searchParties(words),
    scrutins: searchScrutins(words, limit),
    themes: searchThemes(words),
    posts: searchPosts(words, limit, opts?.postsCap ?? 500),
    programmes: searchProgrammes(words, limit),
  };
}

function searchPoliticiansGlobal(words: string[], limit: number): SearchGroup<PoliticianHit> {
  const w = wordConds(words, ["p.full_name", "p.department", "p.group_abbrev", "pa.short_name", "pa.name"]);
  const rows = getSqlite()
    .prepare(
      `SELECT p.id, p.full_name AS fullName, p.chamber, p.department, p.group_abbrev AS groupAbbrev, p.active, p.party_id AS partyId,
              pa.short_name AS partyShort, pa.color AS partyColor, COUNT(*) OVER () AS total
       FROM politicians p LEFT JOIN parties pa ON pa.id = p.party_id
       WHERE ${w.sql} ORDER BY p.active DESC, p.chamber, p.last_name, p.first_name LIMIT ?`,
    )
    .all(...w.params, limit) as (Omit<PoliticianHit, "active"> & { active: number; total: number })[];
  return { total: rows[0]?.total ?? 0, capped: false, items: rows.map((r) => ({ id: r.id, fullName: r.fullName, chamber: r.chamber, department: r.department, groupAbbrev: r.groupAbbrev, active: !!r.active, partyId: r.partyId, partyShort: r.partyShort, partyColor: r.partyColor })) };
}

function searchParties(words: string[]): SearchGroup<PartyHit> {
  const rows = getSqlite().prepare(`SELECT id, name, short_name AS shortName, color, family, leaders FROM parties ORDER BY lr_index`).all() as (Omit<PartyHit, "leaders"> & { leaders: string })[];
  const items = rows
    .map((r) => ({ ...r, leaders: JSON.parse(r.leaders) as string[] }))
    .filter((r) => {
      const hay = fold([r.id, r.name, r.shortName, r.family, ...r.leaders].join(" "));
      // Sigle court (« rn », « ps ») : on exige le mot entier pour éviter les faux positifs.
      return words.every((w) => (w.length <= 3 ? new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u").test(hay) : hay.includes(w)));
    });
  return { total: items.length, capped: false, items };
}

function searchScrutins(words: string[], limit: number): SearchGroup<ScrutinHit> {
  const w = wordConds(words, ["s.title", "s.objet", "a.summary"]);
  const rows = getSqlite()
    .prepare(
      `SELECT s.uid, s.date, s.chamber, s.title, s.sort, a.summary, a.salience, a.primary_theme AS theme, COUNT(*) OVER () AS total
       FROM scrutins s LEFT JOIN scrutin_analyses a ON a.scrutin_uid = s.uid
       WHERE ${w.sql} ORDER BY COALESCE(a.is_procedural, 0), COALESCE(a.salience, 0) DESC, s.date DESC LIMIT ?`,
    )
    .all(...w.params, limit) as (ScrutinHit & { total: number })[];
  return { total: rows[0]?.total ?? 0, capped: false, items: rows.map((r) => ({ uid: r.uid, date: r.date, chamber: r.chamber, title: r.title, sort: r.sort, summary: r.summary, salience: r.salience, theme: r.theme })) };
}

function searchThemes(words: string[]): SearchGroup<ThemeHit> {
  const scored = THEMES.map((t) => {
    const plain = THEME_PLAIN[t.id];
    const label = fold(`${t.id} ${t.label}`);
    const hay = fold([t.label, t.id, t.poleLeft, t.poleRight, t.scope, plain?.question, plain?.left, plain?.right, plain?.examples].filter(Boolean).join(" "));
    if (!words.every((w) => hay.includes(w))) return null;
    const score = words.filter((w) => label.includes(w)).length;
    return { score, hit: { id: t.id, label: t.label, emoji: t.emoji, question: plain?.question ?? t.label, examples: plain?.examples ?? "" } };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
  scored.sort((a, b) => b.score - a.score);
  return { total: scored.length, capped: false, items: scored.map((x) => x.hit) };
}

function searchPosts(words: string[], limit: number, cap: number): SearchGroup<PostHit> {
  const s = getSqlite();
  const w = wordConds(words, ["p.text", "p.title", "p.handle"]);
  // Un seul balayage : l'index par date est parcouru du plus récent au plus ancien, on s'arrête au plafond.
  const ids = s.prepare(`SELECT p.id FROM posts p WHERE ${w.sql} ORDER BY p.created_at DESC LIMIT ?`).all(...w.params, cap + 1) as { id: string }[];
  const first = ids.slice(0, limit).map((r) => r.id);
  if (!first.length) return empty();
  const rows = s
    .prepare(
      `SELECT p.id, p.handle, p.kind, p.title, p.chamber, p.created_at AS createdAt, p.url, p.politician_id AS politicianId, p.party_id AS partyId,
              pa.short_name AS partyShort, pa.color AS partyColor, p.text
       FROM posts p LEFT JOIN parties pa ON pa.id = p.party_id WHERE p.id IN (${first.map(() => "?").join(",")}) ORDER BY p.created_at DESC`,
    )
    .all(...first) as (Omit<PostHit, "excerpt"> & { text: string })[];
  return {
    total: Math.min(ids.length, cap),
    capped: ids.length > cap,
    items: rows.map(({ text, ...r }) => ({ ...r, excerpt: snippet(text, words) })),
  };
}

function searchProgrammes(words: string[], limit: number): SearchGroup<ProgrammeHit> {
  const s = getSqlite();
  // Jamais documents.text ni documents.pdf_base64 : on cherche dans le titre et les analyses.
  const w = wordConds(words, ["d.title", "da.summary", "da.measures", "da.quotes"]);
  const rows = s
    .prepare(
      `SELECT d.id, d.title, d.kind, d.status, d.party_id AS partyId, pa.short_name AS partyShort, pa.color AS partyColor, pa.lr_index AS lrIndex,
              da.theme, da.summary
       FROM documents d LEFT JOIN document_analyses da ON da.document_id = d.id LEFT JOIN parties pa ON pa.id = d.party_id
       WHERE ${w.sql} ORDER BY COALESCE(pa.lr_index, 999), d.id`,
    )
    .all(...w.params) as { id: number; title: string; kind: string; status: string; partyId: string; partyShort: string | null; partyColor: string | null; lrIndex: number | null; theme: string | null; summary: string | null }[];
  const byDoc = new Map<number, ProgrammeHit>();
  for (const r of rows) {
    let hit = byDoc.get(r.id);
    if (!hit) {
      hit = { id: r.id, title: r.title, kind: r.kind, status: r.status, partyId: r.partyId, partyShort: r.partyShort, partyColor: r.partyColor, themes: [], excerpt: null };
      byDoc.set(r.id, hit);
    }
    // Thème retenu seulement si la correspondance vient de l'analyse, pas du seul titre du document.
    const titleMatch = words.every((x) => fold(r.title).includes(x));
    if (r.theme && !titleMatch && !hit.themes.includes(r.theme)) hit.themes.push(r.theme);
    if (!hit.excerpt && r.summary && words.some((x) => fold(r.summary!).includes(x))) hit.excerpt = snippet(r.summary, words, 200);
  }
  const all = [...byDoc.values()];
  return { total: all.length, capped: false, items: all.slice(0, limit) };
}
