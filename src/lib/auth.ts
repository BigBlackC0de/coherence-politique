import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Cloisonnement public / administration.
 *
 * Deux déploiements distincts :
 *  - L'instance LOCALE (machine du propriétaire) : interface complète — jobs, ajout de sources,
 *    chat « Demander », X. C'est elle qui calcule, avec le Claude du propriétaire.
 *  - Le SITE PUBLIC (COHERENCE_PUBLIC=1) : lecture seule, aucune page ni API d'administration,
 *    aucune clé Claude. Il reçoit la base par `npm run publish` (PUT /api/admin/db, jeton Bearer).
 *
 * COHERENCE_ADMIN_TOKEN :
 *  - sur le site public : jeton exigé par la publication (seule porte d'entrée, et elle ne fait qu'écrire la base) ;
 *  - en local : facultatif ; s'il est défini, l'administration demande une connexion sur /admin.
 */

const COOKIE = "coherence_admin";
const SESSION_DAYS = 30;

export function adminToken(): string | null {
  const t = process.env.COHERENCE_ADMIN_TOKEN?.trim();
  return t && t.length >= 12 ? t : null;
}
export const isPublicSite = () => process.env.COHERENCE_PUBLIC === "1";

/** Mode : "open" (local, tout ouvert), "token" (local, session requise), "locked" (site public : administration inexistante). */
export function adminMode(): "open" | "token" | "locked" {
  if (isPublicSite()) return "locked";
  return adminToken() ? "token" : "open";
}

function sign(payload: string, token: string) {
  return crypto.createHmac("sha256", token).update(`coherence-admin:${payload}`).digest("hex");
}

export function makeSessionValue(token: string): string {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  return `${exp}.${sign(String(exp), token)}`;
}

export function verifySessionValue(value: string | undefined, token: string): boolean {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = sign(exp, token);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export function tokenMatches(candidate: string | null | undefined, token: string): boolean {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const sessionCookie = (value: string) => ({
  name: COOKIE,
  value,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 86400,
});
export const COOKIE_NAME = COOKIE;

/** Dans un Server Component ou un Route Handler : l'appelant est-il administrateur ? (toujours faux sur le site public) */
export async function isAdmin(): Promise<boolean> {
  const mode = adminMode();
  if (mode === "open") return true;
  if (mode === "locked") return false;
  const token = adminToken()!;
  const h = await headers();
  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ") && tokenMatches(auth.slice(7).trim(), token)) return true;
  const c = await cookies();
  return verifySessionValue(c.get(COOKIE)?.value, token);
}

/** Pages d'administration : sur le site public, elles n'existent pas (404) ; en local, connexion si nécessaire. */
export async function requireAdmin(next: string) {
  if (await isAdmin()) return;
  if (adminMode() === "locked") redirect("/");
  redirect(`/admin?next=${encodeURIComponent(next)}`);
}

/** Routes d'API d'administration : 404 sur le site public, 401 sans session en local. */
export async function assertAdmin(): Promise<Response | null> {
  if (await isAdmin()) return null;
  if (adminMode() === "locked") return Response.json({ error: "Introuvable" }, { status: 404 });
  return Response.json({ error: "Authentification requise" }, { status: 401 });
}

/** Publication de la base : seule API acceptée sur le site public, par jeton Bearer uniquement. */
export async function assertPublishToken(): Promise<Response | null> {
  const token = adminToken();
  if (!token) return Response.json({ error: "COHERENCE_ADMIN_TOKEN non configuré sur ce serveur" }, { status: 403 });
  const h = await headers();
  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ") && tokenMatches(auth.slice(7).trim(), token)) return null;
  if (!isPublicSite() && (await isAdmin())) return null;
  return Response.json({ error: "Jeton invalide" }, { status: 401 });
}

/* ---- Limitation des tentatives de connexion (mémoire du processus) ---- */
const attempts = new Map<string, { n: number; until: number }>();
export function loginAllowed(ip: string): boolean {
  const a = attempts.get(ip);
  return !a || a.until < Date.now();
}
export function loginFailed(ip: string) {
  const a = attempts.get(ip) ?? { n: 0, until: 0 };
  a.n++;
  if (a.n >= 5) {
    a.until = Date.now() + 15 * 60_000;
    a.n = 0;
  }
  attempts.set(ip, a);
}
export function loginSucceeded(ip: string) {
  attempts.delete(ip);
}
