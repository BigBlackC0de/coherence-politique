import { getSqlite } from "./db";
import { THEMES, THEME_BY_ID } from "./config/themes";
import { ALERT_GAP, DISCOURS_MIN_POSTS, DISCOURS_MIN_SPEAKERS, PROGRAMME_MIN_CONFIDENCE, VOTES_MIN_N, sideOf } from "./config/thresholds";
import { ecartBadge, ecartSentence, type AlignSource } from "./config/plain";
import { voteKind, type VoteKind } from "./analysis/vote-kind";

/**
 * Écarts entre programme, votes et discours, parti par parti et sujet par sujet.
 *
 * Tout est recalculé ici, en lecture seule, avec les mêmes formules que `analysis/scores.ts` :
 *   - programme = Σ position × confiance / Σ confiance (lectures des documents de programme) ;
 *   - votes     = Σ pos × sens × poids × importance / Σ poids × importance (votes de groupe à l'Assemblée,
 *                 pos : pour +1, contre −1, abstention 0) ;
 *   - discours  = moyenne simple des positions des prises de parole analysées (is_political = 1).
 * Recalculer plutôt que lire `party_theme_scores` garantit que les preuves listées sur la page
 * d'un écart sont exactement celles qui produisent la position affichée, même entre deux recalculs.
 * Le résultat est gardé en mémoire tant que les tables d'analyse ne changent pas.
 */

export interface SourceStat {
  /** Position calculée (−1..1), même si elle n'est pas assez fiable pour être affichée. */
  stance: number | null;
  /** Assez d'éléments pour l'afficher et la comparer ? */
  ok: boolean;
  /** Nombre d'éléments (documents, votes, prises de parole). */
  n: number;
}
export interface Alignment {
  partyId: string;
  themeId: string;
  programme: SourceStat & { confidence: number };
  votes: SourceStat;
  discours: SourceStat & { speakers: number };
  /** Écart entre les deux repères fiables les plus éloignés (null si moins de deux repères fiables). */
  spread: number | null;
  pair: [AlignSource, AlignSource] | null;
  alert: boolean;
  /**
   * Contrôle des votes tactiques : la même formule, calculée séparément sur les votes « point précis »
   * (amendements, articles) et sur les votes « texte entier » (ensemble, motions). `diverge` quand les deux
   * penchent de côtés opposés avec un écart ≥ ALERT_GAP : logique de camp, compromis final voté par
   * presque tous, ou texte qui mêle des mesures dans les deux sens. Signalé, jamais corrigé en silence.
   */
  split: { detail: SourceStat; global: SourceStat; diverge: boolean };
}

/** Votes « texte entier » minimum pour comparer (il y en a peu : une poignée par sujet et par an). */
export const SPLIT_MIN_GLOBAL = 3;

const POS: Record<string, number> = { pour: 1, contre: -1, abstention: 0 };

function parse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function fingerprint(): string {
  const r = getSqlite()
    .prepare(
      `SELECT (SELECT COUNT(*) || '|' || COALESCE(MAX(analyzed_at),'') FROM post_analyses) a,
              (SELECT COUNT(*) || '|' || COALESCE(MAX(analyzed_at),'') FROM scrutin_analyses) b,
              (SELECT COUNT(*) || '|' || COALESCE(MAX(analyzed_at),'') FROM document_analyses) c,
              (SELECT COUNT(*) || '|' || SUM(position IS NULL) FROM group_votes) d,
              (SELECT COUNT(*) FROM posts WHERE party_id IS NOT NULL) e`,
    )
    .get() as Record<string, string | number>;
  return Object.values(r).join("#");
}

function finish(
  partyId: string,
  themeId: string,
  p: { num: number; den: number; n: number },
  v: { num: number; den: number; n: number },
  d: { sum: number; n: number; speakers: Set<string> },
  vd: { num: number; den: number; n: number },
  vg: { num: number; den: number; n: number },
): Alignment {
  const programme = {
    stance: p.den > 0 ? p.num / p.den : null,
    confidence: Math.min(1, p.den),
    n: p.n,
    ok: false,
  };
  programme.ok = programme.stance !== null && p.den >= PROGRAMME_MIN_CONFIDENCE;
  const votes = { stance: v.den > 0 ? v.num / v.den : null, n: v.n, ok: false };
  votes.ok = votes.stance !== null && v.n >= VOTES_MIN_N;
  const discours = {
    stance: d.n > 0 ? d.sum / d.n : null,
    n: d.n,
    speakers: d.speakers.size,
    ok: false,
  };
  discours.ok = discours.stance !== null && d.n >= DISCOURS_MIN_POSTS && d.speakers.size >= DISCOURS_MIN_SPEAKERS;
  const pts = (
    [
      ["programme", programme],
      ["votes", votes],
      ["discours", discours],
    ] as [AlignSource, SourceStat][]
  ).filter(([, s]) => s.ok);
  let spread: number | null = null;
  let pair: [AlignSource, AlignSource] | null = null;
  let differentSides = false;
  if (pts.length >= 2) {
    const lo = pts.reduce((a, b) => (b[1].stance! < a[1].stance! ? b : a));
    const hi = pts.reduce((a, b) => (b[1].stance! > a[1].stance! ? b : a));
    spread = hi[1].stance! - lo[1].stance!;
    pair = [lo[0], hi[0]];
    // Même côté (« un peu » / « nettement ») : différence d'intensité, pas d'alerte.
    differentSides = sideOf(lo[1].stance!) !== sideOf(hi[1].stance!);
  }
  return {
    partyId,
    themeId,
    programme,
    votes,
    discours,
    spread,
    pair,
    alert: spread !== null && spread >= ALERT_GAP && differentSides,
    split: splitCheck(vd, vg),
  };
}

function splitCheck(vd: { num: number; den: number; n: number }, vg: { num: number; den: number; n: number }): Alignment["split"] {
  const detail = { stance: vd.den > 0 ? vd.num / vd.den : null, n: vd.n, ok: false };
  detail.ok = detail.stance !== null && vd.n >= VOTES_MIN_N;
  const global = { stance: vg.den > 0 ? vg.num / vg.den : null, n: vg.n, ok: false };
  global.ok = global.stance !== null && vg.n >= SPLIT_MIN_GLOBAL;
  const diverge =
    detail.ok && global.ok && Math.abs(detail.stance! - global.stance!) >= ALERT_GAP && sideOf(detail.stance!) !== sideOf(global.stance!);
  return { detail, global, diverge };
}

let cache: { key: string; map: Map<string, Alignment> } | null = null;

/** Toutes les cellules parti × sujet (clé `parti|sujet`). */
export function allAlignments(): Map<string, Alignment> {
  const key = fingerprint();
  if (cache?.key === key) return cache.map;
  const s = getSqlite();
  const parties = (s.prepare(`SELECT id FROM parties`).all() as { id: string }[]).map((r) => r.id);
  const prog = new Map<string, { num: number; den: number; n: number }>();
  for (const r of s
    .prepare(`SELECT d.party_id AS partyId, da.theme, da.stance, da.confidence FROM document_analyses da JOIN documents d ON d.id = da.document_id WHERE da.stance IS NOT NULL`)
    .all() as {
    partyId: string;
    theme: string;
    stance: number;
    confidence: number;
  }[]) {
    const k = `${r.partyId}|${r.theme}`;
    const a = prog.get(k) ?? { num: 0, den: 0, n: 0 };
    a.num += r.stance * r.confidence;
    a.den += r.confidence;
    a.n++;
    prog.set(k, a);
  }
  const vot = new Map<string, { num: number; den: number; n: number }>();
  const votDetail = new Map<string, { num: number; den: number; n: number }>();
  const votGlobal = new Map<string, { num: number; den: number; n: number }>();
  for (const r of s
    .prepare(
      `SELECT gv.party_id AS partyId, gv.position, sc.title, a.themes, a.salience FROM group_votes gv JOIN scrutins sc ON sc.uid = gv.scrutin_uid JOIN scrutin_analyses a ON a.scrutin_uid = gv.scrutin_uid
       WHERE sc.chamber != 'SENAT' AND gv.party_id IS NOT NULL AND a.is_procedural = 0 AND gv.position IS NOT NULL`,
    )
    .all() as {
    partyId: string;
    position: string;
    title: string;
    themes: string;
    salience: number;
  }[]) {
    const pos = POS[r.position];
    if (pos === undefined) continue;
    const kind = voteKind(r.title);
    const byKind = kind === "detail" ? votDetail : kind === "global" ? votGlobal : null;
    for (const t of parse<{ theme: string; direction: number; weight: number }[]>(r.themes, [])) {
      if (!t.direction) continue;
      const k = `${r.partyId}|${t.theme}`;
      const a = vot.get(k) ?? { num: 0, den: 0, n: 0 };
      const w = t.weight * r.salience;
      a.num += pos * t.direction * w;
      a.den += w;
      a.n++;
      vot.set(k, a);
      if (byKind) {
        const b = byKind.get(k) ?? { num: 0, den: 0, n: 0 };
        b.num += pos * t.direction * w;
        b.den += w;
        b.n++;
        byKind.set(k, b);
      }
    }
  }
  const dis = new Map<string, { sum: number; n: number; speakers: Set<string> }>();
  for (const r of s
    .prepare(
      `SELECT p.party_id AS partyId, COALESCE(p.politician_id, p.handle) AS speaker, pa.themes FROM post_analyses pa JOIN posts p ON p.id = pa.post_id WHERE p.party_id IS NOT NULL AND pa.is_political = 1`,
    )
    .all() as { partyId: string; speaker: string; themes: string }[]) {
    for (const t of parse<{ theme: string; stance: number }[]>(r.themes, [])) {
      if (typeof t.stance !== "number") continue;
      const k = `${r.partyId}|${t.theme}`;
      const a = dis.get(k) ?? { sum: 0, n: 0, speakers: new Set<string>() };
      a.sum += t.stance;
      a.n++;
      a.speakers.add(r.speaker);
      dis.set(k, a);
    }
  }
  const map = new Map<string, Alignment>();
  const zero = () => ({ num: 0, den: 0, n: 0 });
  for (const pid of parties)
    for (const t of THEMES) {
      const k = `${pid}|${t.id}`;
      map.set(k, finish(pid, t.id, prog.get(k) ?? zero(), vot.get(k) ?? zero(), dis.get(k) ?? { sum: 0, n: 0, speakers: new Set() }, votDetail.get(k) ?? zero(), votGlobal.get(k) ?? zero()));
    }
  cache = { key, map };
  return map;
}

export function alignmentFor(partyId: string, themeId: string): Alignment | null {
  return allAlignments().get(`${partyId}|${themeId}`) ?? null;
}

/** Chiffres de la page « Comment ça marche ? » : poids réel des votes « texte entier » dans le calcul. */
export function voteKindStats() {
  const rows = getSqlite()
    .prepare(
      `SELECT sc.title, a.themes, a.salience FROM scrutins sc JOIN scrutin_analyses a ON a.scrutin_uid = sc.uid
       WHERE sc.chamber != 'SENAT' AND a.is_procedural = 0`,
    )
    .all() as { title: string; themes: string; salience: number }[];
  const n = { detail: 0, global: 0, autre: 0 };
  const w = { detail: 0, global: 0, autre: 0 };
  for (const r of rows) {
    const k = voteKind(r.title);
    const ts = parse<{ direction: number; weight: number }[]>(r.themes, []).filter((t) => t.direction);
    if (!ts.length) continue;
    n[k]++;
    for (const t of ts) w[k] += t.weight * r.salience;
  }
  const totalW = w.detail + w.global + w.autre;
  const cells = [...allAlignments().values()];
  const names = new Map(
    (getSqlite().prepare(`SELECT id, short_name AS shortName, lr_index AS lr FROM parties`).all() as { id: string; shortName: string; lr: number | null }[]).map((p) => [p.id, p]),
  );
  return {
    detail: n.detail,
    global: n.global,
    globalWeightShare: totalW > 0 ? w.global / totalW : 0,
    compared: cells.filter((c) => c.split.detail.ok && c.split.global.ok).length,
    diverging: cells
      .filter((c) => c.split.diverge)
      .map((c) => ({ ...c, shortName: names.get(c.partyId)?.shortName ?? c.partyId, lr: names.get(c.partyId)?.lr ?? 999 }))
      .sort((a, b) => a.themeId.localeCompare(b.themeId) || a.lr - b.lr),
  };
}

export interface BigGap extends Alignment {
  partyName: string;
  shortName: string;
  color: string;
  sentence: string;
  badge: string;
}

/** Les divergences qui passent les seuils, de la plus forte à la plus faible. */
export function bigGaps(limit?: number): BigGap[] {
  const parties = new Map(
    (
      getSqlite().prepare(`SELECT id, name, short_name AS shortName, color FROM parties`).all() as {
        id: string;
        name: string;
        shortName: string;
        color: string;
      }[]
    ).map((p) => [p.id, p]),
  );
  const out: BigGap[] = [];
  for (const a of allAlignments().values()) {
    const p = parties.get(a.partyId);
    if (!a.alert || !p) continue;
    out.push({
      ...a,
      partyName: p.name,
      shortName: p.shortName,
      color: p.color,
      badge: ecartBadge(a.pair),
      sentence: ecartSentence(a.themeId, p.shortName, stancesOf(a)),
    });
  }
  out.sort((x, y) => (y.spread ?? 0) - (x.spread ?? 0));
  return limit ? out.slice(0, limit) : out;
}

/** Positions fiables seulement (les autres à null), pour les phrases. */
export function stancesOf(a: Alignment) {
  return {
    programme: a.programme.ok ? a.programme.stance : null,
    votes: a.votes.ok ? a.votes.stance : null,
    discours: a.discours.ok ? a.discours.stance : null,
    pair: a.pair,
  };
}

/** Compteurs pour dire honnêtement où en est l'analyse. */
export function ecartsStatus() {
  const s = getSqlite();
  const one = (q: string) => (s.prepare(q).get() as { n: number }).n;
  const all = [...allAlignments().values()];
  return {
    postsAnalyzed: one(`SELECT COUNT(*) n FROM post_analyses`),
    posts: one(`SELECT COUNT(*) n FROM posts`),
    cells: all.length,
    discoursOk: all.filter((a) => a.discours.ok).length,
    comparable: all.filter((a) => a.spread !== null).length,
    alerts: all.filter((a) => a.alert).length,
  };
}

/* ------------------------------------------------------------------ */
/* Preuves d'une cellule parti × sujet                                 */
/* ------------------------------------------------------------------ */

export interface ProgrammeProof {
  documentId: number;
  title: string;
  url: string | null;
  stance: number;
  confidence: number;
  summary: string;
  measures: string[];
  quotes: string[];
}
export interface VoteProof {
  uid: string;
  date: string;
  title: string;
  summary: string | null;
  position: string;
  /** Sens d'un vote POUR sur l'axe du sujet (−1 ou +1). */
  direction: number;
  salience: number;
  /** poids × importance */
  weight: number;
  /** pos × sens : −1 (vers le pôle gauche), 0, +1 (vers le pôle droit) */
  effect: number;
  /** Part du sujet dans le vote (weight × salience = poids). */
  themeWeight: number;
  /** Décompte du groupe, d'où vient `position`. */
  pour: number;
  contre: number;
  abstentions: number;
  kind: VoteKind;
}
export interface DiscoursProof {
  id: string;
  speaker: string;
  politicianId: string | null;
  kind: string;
  chamber: string | null;
  title: string | null;
  text: string;
  date: string;
  url: string | null;
  stance: number;
}

export function ecartProofs(partyId: string, themeId: string) {
  if (!THEME_BY_ID[themeId]) return null;
  const s = getSqlite();
  const party = s.prepare(`SELECT id, name, short_name AS shortName, color FROM parties WHERE id = ?`).get(partyId) as { id: string; name: string; shortName: string; color: string } | undefined;
  if (!party) return null;
  const alignment = alignmentFor(partyId, themeId);
  if (!alignment) return null;

  const programme = (
    s
      .prepare(
        `SELECT d.id AS documentId, d.title, d.url, da.stance, da.confidence, da.summary, da.measures, da.quotes FROM document_analyses da JOIN documents d ON d.id = da.document_id
         WHERE d.party_id = ? AND da.theme = ? AND da.stance IS NOT NULL ORDER BY da.confidence DESC`,
      )
      .all(partyId, themeId) as (Omit<ProgrammeProof, "measures" | "quotes"> & {
      measures: string;
      quotes: string;
    })[]
  ).map((r) => ({
    ...r,
    measures: parse<string[]>(r.measures, []),
    quotes: parse<string[]>(r.quotes, []),
  }));

  const votes: VoteProof[] = [];
  for (const r of s
    .prepare(
      `SELECT sc.uid, sc.date, sc.title, a.summary, gv.position, gv.pour, gv.contre, gv.abstentions, a.themes, a.salience FROM group_votes gv JOIN scrutins sc ON sc.uid = gv.scrutin_uid JOIN scrutin_analyses a ON a.scrutin_uid = gv.scrutin_uid
       WHERE sc.chamber != 'SENAT' AND gv.party_id = ? AND a.is_procedural = 0 AND gv.position IS NOT NULL`,
    )
    .all(partyId) as {
    uid: string;
    date: string;
    title: string;
    summary: string | null;
    position: string;
    pour: number;
    contre: number;
    abstentions: number;
    themes: string;
    salience: number;
  }[]) {
    const pos = POS[r.position];
    if (pos === undefined) continue;
    for (const t of parse<{ theme: string; direction: number; weight: number }[]>(r.themes, [])) {
      if (t.theme !== themeId || !t.direction) continue;
      votes.push({
        uid: r.uid,
        date: r.date,
        title: r.title,
        summary: r.summary,
        position: r.position,
        direction: t.direction,
        salience: r.salience,
        weight: t.weight * r.salience,
        effect: pos * t.direction,
        themeWeight: t.weight,
        pour: r.pour,
        contre: r.contre,
        abstentions: r.abstentions,
        kind: voteKind(r.title),
      });
    }
  }
  votes.sort((a, b) => b.weight - a.weight || b.date.localeCompare(a.date));

  const discours: DiscoursProof[] = [];
  for (const r of s
    .prepare(
      `SELECT p.id, p.handle AS speaker, p.politician_id AS politicianId, p.kind, p.chamber, p.title, p.text, p.created_at AS date, p.url, pa.themes FROM post_analyses pa JOIN posts p ON p.id = pa.post_id
       WHERE p.party_id = ? AND pa.is_political = 1 ORDER BY p.created_at DESC`,
    )
    .all(partyId) as (Omit<DiscoursProof, "stance"> & { themes: string })[]) {
    for (const t of parse<{ theme: string; stance: number }[]>(r.themes, [])) {
      if (t.theme !== themeId || typeof t.stance !== "number") continue;
      const { themes: _t, ...rest } = r;
      void _t;
      discours.push({ ...rest, stance: t.stance });
    }
  }

  const sums = {
    programme: programme.reduce(
      (a, r) => ({
        num: a.num + r.stance * r.confidence,
        den: a.den + r.confidence,
      }),
      { num: 0, den: 0 },
    ),
    votes: votes.reduce((a, r) => ({ num: a.num + r.effect * r.weight, den: a.den + r.weight }), { num: 0, den: 0 }),
    discours: {
      num: discours.reduce((a, r) => a + r.stance, 0),
      den: discours.length,
    },
  };
  return { party, alignment, programme, votes, discours, sums };
}
