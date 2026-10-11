import { getSqlite } from "./db";
import { THEME_BY_ID } from "./config/themes";
import { voteKind, type VoteKind } from "./analysis/vote-kind";

/**
 * Calcul d'une position individuelle (un élu × un sujet), vote par vote.
 * Mêmes règles que `computePoliticianScores` (analysis/scores.ts) : votes non procéduraux,
 * hors non-votants, pos × sens × part du sujet × importance, divisé par la somme des poids.
 */
const POS: Record<string, number> = { pour: 1, contre: -1, abstention: 0 };

export interface PoliticianVoteCalc {
  uid: string;
  date: string;
  title: string;
  summary: string | null;
  chamber: string;
  position: string;
  groupPosition: string | null;
  direction: number;
  themeWeight: number;
  salience: number;
  weight: number;
  contribution: number;
  kind: VoteKind;
}

export function politicianThemeCalc(politicianId: string, themeId: string) {
  if (!THEME_BY_ID[themeId]) return null;
  const s = getSqlite();
  const politician = s
    .prepare(`SELECT id, full_name AS fullName, party_id AS partyId, group_abbrev AS groupAbbrev, chamber FROM politicians WHERE id = ?`)
    .get(politicianId) as { id: string; fullName: string; partyId: string | null; groupAbbrev: string | null; chamber: string } | undefined;
  if (!politician) return null;
  const rows = s
    .prepare(
      `SELECT sc.uid, sc.date, sc.title, sc.chamber, a.summary, v.position, gv.position AS groupPosition, a.themes, a.salience
       FROM votes v
       JOIN scrutins sc ON sc.uid = v.scrutin_uid
       JOIN scrutin_analyses a ON a.scrutin_uid = v.scrutin_uid
       JOIN politicians p ON p.id = v.politician_id
       LEFT JOIN group_votes gv ON gv.scrutin_uid = v.scrutin_uid AND gv.group_ref = p.group_ref
       WHERE v.politician_id = ? AND a.is_procedural = 0 AND v.position != 'nonVotant'`,
    )
    .all(politicianId) as { uid: string; date: string; title: string; chamber: string; summary: string | null; position: string; groupPosition: string | null; themes: string; salience: number }[];
  const votes: PoliticianVoteCalc[] = [];
  for (const r of rows) {
    const pos = POS[r.position];
    if (pos === undefined) continue;
    let themes: { theme: string; direction: number; weight: number }[] = [];
    try {
      themes = JSON.parse(r.themes);
    } catch {
      continue;
    }
    for (const t of themes) {
      if (t.theme !== themeId || !t.direction) continue;
      const weight = t.weight * r.salience;
      votes.push({
        uid: r.uid,
        date: r.date,
        title: r.title,
        summary: r.summary,
        chamber: r.chamber,
        position: r.position,
        groupPosition: r.groupPosition,
        direction: t.direction,
        themeWeight: t.weight,
        salience: r.salience,
        weight,
        contribution: pos * t.direction * weight,
        kind: voteKind(r.title),
      });
    }
  }
  votes.sort((a, b) => b.weight - a.weight || b.date.localeCompare(a.date));
  const num = votes.reduce((a, v) => a + v.contribution, 0);
  const den = votes.reduce((a, v) => a + v.weight, 0);
  return { politician, votes, num, den, stance: den > 0 ? num / den : null };
}
