import { and, eq, desc } from "drizzle-orm";
import { getDb, schema } from "./db";

export type CandidateRow = typeof schema.candidates.$inferSelect;
export type PartyRow = typeof schema.parties.$inferSelect;

/** Âge à aujourd'hui à partir d'une date AAAA-MM-JJ. */
export function ageFrom(birthDate: string | null | undefined): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const b = new Date(birthDate);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}

export const initials = (c: Pick<CandidateRow, "firstName" | "lastName">) => `${c.firstName.charAt(0)}${c.lastName.charAt(0)}`.toUpperCase();

/** Candidats dans le périmètre (partis ayant des députés), ordre alphabétique (ordre neutre, jamais par sondage). */
export function listCandidates(): { candidates: CandidateRow[]; parties: Map<string, PartyRow> } {
  const db = getDb();
  const candidates = db
    .select()
    .from(schema.candidates)
    .all()
    .filter((c) => c.scope !== "out" && c.status !== "pressenti") // pressentis : suivis en base, affichés dès qu'ils se déclarent
    .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr"));
  const parties = new Map(db.select().from(schema.parties).all().map((p) => [p.id, p]));
  return { candidates, parties };
}

export function candidateDetail(id: string) {
  const db = getDb();
  const c = db.select().from(schema.candidates).where(eq(schema.candidates.id, id)).get();
  if (!c || c.scope === "out" || c.status === "pressenti") return null; // hors périmètre : masqué du site
  const party = c.partyId ? (db.select().from(schema.parties).where(eq(schema.parties.id, c.partyId)).get() ?? null) : null;
  const programme = c.partyId
    ? (db
        .select({ id: schema.documents.id, title: schema.documents.title })
        .from(schema.documents)
        .where(and(eq(schema.documents.partyId, c.partyId), eq(schema.documents.status, "analyzed")))
        .orderBy(desc(schema.documents.id))
        .get() ?? null)
    : null;
  return { candidate: c, party, programme };
}
