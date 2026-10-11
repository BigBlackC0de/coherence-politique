import { getSqlite } from "./db";

/**
 * Lectures complémentaires pour les images de partage (`/partager/...`).
 * Lecture seule : uniquement des données déjà affichées sur les pages publiques.
 */

/** Résumés en clair (scrutin_analyses.summary) des scrutins demandés. */
export function scrutinSummaries(uids: string[]): Record<string, { summary: string | null; sort: string | null; chamber: string }> {
  const list = [...new Set(uids)].slice(0, 50);
  if (!list.length) return {};
  const rows = getSqlite()
    .prepare(
      `SELECT s.uid AS uid, s.sort AS sort, s.chamber AS chamber, a.summary AS summary
       FROM scrutins s LEFT JOIN scrutin_analyses a ON a.scrutin_uid = s.uid
       WHERE s.uid IN (${list.map(() => "?").join(",")})`,
    )
    .all(...list) as { uid: string; sort: string | null; chamber: string; summary: string | null }[];
  return Object.fromEntries(rows.map((r) => [r.uid, { summary: r.summary, sort: r.sort, chamber: r.chamber }]));
}

/** Fiche minimale d'un parlementaire (métadonnées de page). */
export function politicianBrief(id: string) {
  return getSqlite()
    .prepare(
      `SELECT p.id AS id, p.full_name AS fullName, p.chamber AS chamber, p.group_abbrev AS groupAbbrev, p.department AS department, pa.name AS partyName
       FROM politicians p LEFT JOIN parties pa ON pa.id = p.party_id WHERE p.id = ?`,
    )
    .get(id) as { id: string; fullName: string; chamber: string; groupAbbrev: string | null; department: string | null; partyName: string | null } | undefined;
}

/** Fiche minimale d'un scrutin (métadonnées de page). */
export function scrutinBrief(uid: string) {
  return getSqlite()
    .prepare(`SELECT s.uid AS uid, s.title AS title, s.date AS date, s.chamber AS chamber, s.sort AS sort, a.summary AS summary, a.stakes AS stakes FROM scrutins s LEFT JOIN scrutin_analyses a ON a.scrutin_uid = s.uid WHERE s.uid = ?`)
    .get(uid) as { uid: string; title: string; date: string; chamber: string; sort: string | null; summary: string | null; stakes: string | null } | undefined;
}
