import { getSqlite } from "../db";

/**
 * Assiduité aux scrutins publics.
 *
 * Méthode : pour chaque parlementaire en exercice, les scrutins « éligibles » sont ceux de sa
 * chambre tenus depuis le début de son mandat (date officielle pour l'AN ; à défaut, premier
 * vote enregistré). Un parlementaire absent n'apparaît pas dans les résultats d'un scrutin :
 * la présence se mesure donc par l'existence d'une position (pour / contre / abstention /
 * non-votant). « Non-votant » = présent mais n'a pas pris part (présidence de séance, etc.).
 *
 * Limite : seuls les scrutins publics sont comptés (la majorité des votes se fait à main levée) ;
 * c'est un indicateur de présence aux votes solennels et aux scrutins demandés, pas du travail
 * en commission ou en circonscription.
 */

export interface MemberParticipation {
  id: string;
  fullName: string;
  partyId: string | null;
  partyShort: string | null;
  partyColor: string | null;
  groupAbbrev: string | null;
  department: string | null;
  since: string | null;
  eligible: number;
  present: number;
  voted: number;
  /** present / eligible, borné à 1 */
  presenceRate: number;
  /** voted / eligible, borné à 1 */
  voteRate: number;
  /** Présent à (presque) tous les scrutins sans jamais voter : présidence de l'Assemblée. */
  presidency: boolean;
}

export interface PartyParticipation {
  partyId: string;
  name: string;
  shortName: string;
  color: string;
  lrIndex: number;
  members: number;
  eligible: number;
  present: number;
  voted: number;
  presenceRate: number;
  voteRate: number;
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** Nombre d'éléments de `sorted` (trié croissant) ≥ `from` et (si fourni) ≤ `to`. */
function countBetween(sorted: string[], from: string, to: string | null): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < from) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;
  if (!to) return sorted.length - start;
  lo = start;
  hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= to) lo = mid + 1;
    else hi = mid;
  }
  return lo - start;
}

export function memberParticipation(chamber: "AN" | "SENAT", opts?: { minEligible?: number; by?: "presence" | "vote" }): MemberParticipation[] {
  const by = opts?.by ?? (chamber === "AN" ? "presence" : "vote");
  const s = getSqlite();
  const dates = (s.prepare(`SELECT date FROM scrutins WHERE chamber = ? ORDER BY date`).all(chamber) as { date: string }[]).map((r) => r.date);
  const agg = new Map<string, { present: number; voted: number; first: string }>();
  for (const r of s
    .prepare(
      `SELECT v.politician_id AS id, COUNT(*) AS present, SUM(CASE WHEN v.position != 'nonVotant' THEN 1 ELSE 0 END) AS voted, MIN(s.date) AS first
       FROM votes v JOIN scrutins s ON s.uid = v.scrutin_uid WHERE s.chamber = ? GROUP BY v.politician_id`,
    )
    .all(chamber) as { id: string; present: number; voted: number; first: string }[]) {
    agg.set(r.id, r);
  }
  const rows = s
    .prepare(
      `SELECT p.id, p.full_name AS fullName, p.party_id AS partyId, p.group_abbrev AS groupAbbrev, p.department, p.mandate_start AS mandateStart, p.mandate_end AS mandateEnd,
              pa.short_name AS partyShort, pa.color AS partyColor
       FROM politicians p LEFT JOIN parties pa ON pa.id = p.party_id WHERE p.chamber = ? AND p.active = 1`,
    )
    .all(chamber) as { id: string; fullName: string; partyId: string | null; groupAbbrev: string | null; department: string | null; mandateStart: string | null; mandateEnd: string | null; partyShort: string | null; partyColor: string | null }[];
  const minEligible = opts?.minEligible ?? 1;
  const out: MemberParticipation[] = [];
  for (const r of rows) {
    const a = agg.get(r.id);
    const since = r.mandateStart ?? a?.first ?? null;
    if (!since) continue;
    const eligible = countBetween(dates, since, r.mandateEnd);
    if (eligible < minEligible) continue;
    const present = Math.min(a?.present ?? 0, eligible);
    const voted = Math.min(a?.voted ?? 0, eligible);
    out.push({
      id: r.id,
      fullName: r.fullName,
      partyId: r.partyId,
      partyShort: r.partyShort,
      partyColor: r.partyColor,
      groupAbbrev: r.groupAbbrev,
      department: r.department,
      since,
      eligible,
      present,
      voted,
      presenceRate: clamp(present / eligible),
      voteRate: clamp(voted / eligible),
      presidency: present >= 0.98 * eligible && voted <= 0.02 * present && present > 100,
    });
  }
  const key = (m: MemberParticipation) => (by === "presence" ? m.presenceRate : m.voteRate);
  return out.sort((a, b) => key(b) - key(a) || b.voteRate - a.voteRate || a.fullName.localeCompare(b.fullName, "fr"));
}

export function partyParticipation(chamber: "AN" | "SENAT", members = memberParticipation(chamber, { minEligible: 20 })): PartyParticipation[] {
  const s = getSqlite();
  const parties = s.prepare(`SELECT id, name, short_name AS shortName, color, lr_index AS lrIndex FROM parties`).all() as { id: string; name: string; shortName: string; color: string; lrIndex: number }[];
  return parties
    .map((p) => {
      const ms = members.filter((m) => m.partyId === p.id);
      const eligible = ms.reduce((a, m) => a + m.eligible, 0);
      const present = ms.reduce((a, m) => a + m.present, 0);
      const voted = ms.reduce((a, m) => a + m.voted, 0);
      return { partyId: p.id, name: p.name, shortName: p.shortName, color: p.color, lrIndex: p.lrIndex, members: ms.length, eligible, present, voted, presenceRate: eligible ? present / eligible : 0, voteRate: eligible ? voted / eligible : 0 };
    })
    .filter((p) => p.members > 0)
    .sort((a, b) => (chamber === "AN" ? b.presenceRate - a.presenceRate : b.voteRate - a.voteRate));
}

export function participationSummary(chamber: "AN" | "SENAT", members = memberParticipation(chamber, { minEligible: 1 })) {
  const s = getSqlite();
  const scrutins = (s.prepare(`SELECT COUNT(*) n, MIN(date) d0, MAX(date) d1 FROM scrutins WHERE chamber = ?`).get(chamber) as { n: number; d0: string | null; d1: string | null }) ?? { n: 0, d0: null, d1: null };
  const eligible = Math.max(1, members.reduce((a, m) => a + m.eligible, 0));
  return {
    scrutins: scrutins.n,
    from: scrutins.d0,
    to: scrutins.d1,
    members: members.length,
    meanPresence: members.reduce((a, m) => a + m.present, 0) / eligible,
    meanVote: members.reduce((a, m) => a + m.voted, 0) / eligible,
  };
}
