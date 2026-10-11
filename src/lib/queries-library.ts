import { getSqlite } from "@/lib/db";

/**
 * Requêtes de la « bibliothèque » publique : prises de parole et programmes.
 * Toutes les colonnes sont aliasées en camelCase (getSqlite renvoie du snake_case).
 */

/* ------------------------------------------------------------------ */
/* Prises de parole                                                    */
/* ------------------------------------------------------------------ */

export interface PostFilters {
  q?: string;
  party?: string;
  kind?: string;
  chamber?: string; // AN | SENAT | none (communiqués)
  elu?: string; // politician id
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
}

export interface PostRow {
  id: string;
  handle: string;
  partyId: string | null;
  politicianId: string | null;
  kind: string;
  title: string | null;
  chamber: string | null;
  text: string;
  createdAt: string;
  url: string | null;
  partyName: string | null;
  partyShort: string | null;
  partyColor: string | null;
  politicianName: string | null;
  themes: string | null; // JSON [{theme, stance}]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Construit la clause WHERE ; `skip` permet d'ignorer un filtre (compteurs par facette). */
function where(f: PostFilters, skip?: keyof PostFilters): { sql: string; args: unknown[] } {
  const parts: string[] = [];
  const args: unknown[] = [];
  const q = f.q?.trim();
  if (q && skip !== "q") {
    // Chaque mot doit apparaître quelque part (texte, titre ou orateur).
    for (const w of q.split(/\s+/).filter(Boolean).slice(0, 6)) {
      const like = `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      parts.push(`(p.text LIKE ? ESCAPE '\\' OR p.title LIKE ? ESCAPE '\\' OR p.handle LIKE ? ESCAPE '\\')`);
      args.push(like, like, like);
    }
  }
  if (f.party && skip !== "party") {
    parts.push("p.party_id = ?");
    args.push(f.party);
  }
  if (f.kind && skip !== "kind") {
    parts.push("p.kind = ?");
    args.push(f.kind);
  }
  if (f.chamber && skip !== "chamber") {
    if (f.chamber === "none") parts.push("p.chamber IS NULL");
    else {
      parts.push("p.chamber = ?");
      args.push(f.chamber);
    }
  }
  if (f.elu && skip !== "elu") {
    parts.push("p.politician_id = ?");
    args.push(f.elu);
  }
  if (f.from && DATE_RE.test(f.from) && skip !== "from") {
    parts.push("p.created_at >= ?");
    args.push(f.from);
  }
  if (f.to && DATE_RE.test(f.to) && skip !== "to") {
    parts.push("p.created_at < date(?, '+1 day')");
    args.push(f.to);
  }
  return { sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", args };
}

/**
 * Recherche paginée + compteurs par nature / parti / chambre.
 * Un seul balayage pour les compteurs : on groupe par (nature, parti, chambre) sous les filtres
 * « coûteux » (texte, élu, période), puis on applique les autres filtres en mémoire.
 */
export function searchPosts(
  f: PostFilters,
  page = 1,
  perPage = 20,
): { rows: PostRow[]; total: number; page: number; pages: number; facets: { byKind: Record<string, number>; byParty: Record<string, number>; byChamber: Record<string, number> } } {
  const s = getSqlite();
  const base = where({ q: f.q, elu: f.elu, from: f.from, to: f.to });
  const groups = s
    .prepare(`SELECT p.kind AS kind, COALESCE(p.party_id, 'none') AS party, COALESCE(p.chamber, 'none') AS chamber, COUNT(*) AS n FROM posts p ${base.sql} GROUP BY 1, 2, 3`)
    .all(...base.args) as { kind: string; party: string; chamber: string; n: number }[];
  const ok = (g: (typeof groups)[number], skip?: "kind" | "party" | "chamber") =>
    (skip === "kind" || !f.kind || g.kind === f.kind) && (skip === "party" || !f.party || g.party === f.party) && (skip === "chamber" || !f.chamber || g.chamber === f.chamber);
  const facet = (key: "kind" | "party" | "chamber") => {
    const out: Record<string, number> = {};
    for (const g of groups) if (ok(g, key)) out[g[key]] = (out[g[key]] ?? 0) + g.n;
    return out;
  };
  const total = groups.reduce((a, g) => a + (ok(g) ? g.n : 0), 0);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const w = where(f);
  const rows = total
    ? (s
        .prepare(
          `SELECT p.id, p.handle, p.party_id AS partyId, p.politician_id AS politicianId, p.kind, p.title, p.chamber,
              p.text, p.created_at AS createdAt, p.url,
              pt.name AS partyName, pt.short_name AS partyShort, pt.color AS partyColor,
              pol.full_name AS politicianName, pa.themes AS themes
       FROM posts p
       LEFT JOIN parties pt ON pt.id = p.party_id
       LEFT JOIN politicians pol ON pol.id = p.politician_id
       LEFT JOIN post_analyses pa ON pa.post_id = p.id
       ${w.sql}
       ORDER BY p.created_at DESC, p.id
       LIMIT ? OFFSET ?`,
        )
        .all(...w.args, perPage, (p - 1) * perPage) as PostRow[])
    : [];
  return { rows, total, page: p, pages, facets: { byKind: facet("kind"), byParty: facet("party"), byChamber: facet("chamber") } };
}

export function politicianName(id: string): { id: string; fullName: string; partyId: string | null; chamber: string } | null {
  return (getSqlite().prepare(`SELECT id, full_name AS fullName, party_id AS partyId, chamber FROM politicians WHERE id = ?`).get(id) as { id: string; fullName: string; partyId: string | null; chamber: string } | undefined) ?? null;
}

export interface PartyLite {
  id: string;
  name: string;
  shortName: string;
  color: string;
  lrIndex: number;
}
export function partiesLite(): PartyLite[] {
  return getSqlite().prepare(`SELECT id, name, short_name AS shortName, color, lr_index AS lrIndex FROM parties ORDER BY lr_index`).all() as PartyLite[];
}

/* ------------------------------------------------------------------ */
/* Programmes                                                          */
/* ------------------------------------------------------------------ */

export interface DocSummary {
  period: string;
  summary: string;
}

function docSummaries(ids?: number[]): Map<number, DocSummary> {
  const s = getSqlite();
  const rows = (
    ids && ids.length === 1
      ? s.prepare(`SELECT key, value FROM settings WHERE key = ?`).all(`doc-summary:${ids[0]}`)
      : s.prepare(`SELECT key, value FROM settings WHERE key LIKE 'doc-summary:%'`).all()
  ) as { key: string; value: string }[];
  const out = new Map<number, DocSummary>();
  for (const r of rows) {
    try {
      out.set(Number(r.key.split(":")[1]), JSON.parse(r.value) as DocSummary);
    } catch {
      /* valeur illisible : ignorée */
    }
  }
  return out;
}

export interface DocListItem {
  id: number;
  partyId: string;
  kind: string;
  title: string;
  url: string | null;
  status: string;
  fetchedAt: string | null;
  themesCovered: number;
  period: string | null;
  summary: string | null;
}

/** Programmes regroupés par parti (ordre gauche → droite). Ne lit jamais documents.text. */
export function programmesByParty(): { party: PartyLite; docs: DocListItem[] }[] {
  const s = getSqlite();
  const docs = s
    .prepare(
      `SELECT d.id, d.party_id AS partyId, d.kind, d.title, d.url, d.status, d.fetched_at AS fetchedAt,
              (SELECT COUNT(*) FROM document_analyses da WHERE da.document_id = d.id AND da.stance IS NOT NULL) AS themesCovered
       FROM documents d
       ORDER BY d.status = 'analyzed' DESC, d.id`,
    )
    .all() as Omit<DocListItem, "period" | "summary">[];
  const sums = docSummaries();
  return partiesLite().map((party) => ({
    party,
    docs: docs.filter((d) => d.partyId === party.id).map((d) => ({ ...d, period: sums.get(d.id)?.period ?? null, summary: sums.get(d.id)?.summary ?? null })),
  }));
}

export interface DocThemeAnalysis {
  theme: string;
  stance: number | null;
  confidence: number;
  summary: string;
  measures: string[];
  quotes: string[];
}

export function programmeDetail(id: number) {
  const s = getSqlite();
  const doc = s
    .prepare(`SELECT id, party_id AS partyId, kind, title, url, status, fetched_at AS fetchedAt, error FROM documents WHERE id = ?`)
    .get(id) as { id: number; partyId: string; kind: string; title: string; url: string | null; status: string; fetchedAt: string | null; error: string | null } | undefined;
  if (!doc) return null;
  const party = s.prepare(`SELECT id, name, short_name AS shortName, color, lr_index AS lrIndex FROM parties WHERE id = ?`).get(doc.partyId) as PartyLite | undefined;
  const parse = (v: string | null): string[] => {
    if (!v) return [];
    try {
      const a = JSON.parse(v) as unknown;
      return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  const analyses = (
    s.prepare(`SELECT theme, stance, confidence, summary, measures, quotes FROM document_analyses WHERE document_id = ?`).all(id) as { theme: string; stance: number | null; confidence: number; summary: string; measures: string | null; quotes: string | null }[]
  ).map((r): DocThemeAnalysis => ({ theme: r.theme, stance: r.stance, confidence: r.confidence, summary: r.summary, measures: parse(r.measures), quotes: parse(r.quotes) }));
  const others = s
    .prepare(`SELECT id, title FROM documents WHERE party_id = ? AND id <> ? AND status = 'analyzed' ORDER BY id`)
    .all(doc.partyId, id) as { id: number; title: string }[];
  return { doc, party: party ?? null, summary: docSummaries([id]).get(id) ?? null, analyses, others };
}
