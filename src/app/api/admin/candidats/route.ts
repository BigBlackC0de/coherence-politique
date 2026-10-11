import { NextRequest } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { CANDIDATE_STATUSES, setCandidateScope, setCandidateStatus, type CandidateStatus } from "@/lib/claude/candidates";

/**
 * Action d'administration : poser le statut d'un candidat, en particulier « officiel »
 * après la publication par le Conseil constitutionnel de la liste des candidats (500 parrainages).
 * 404 sur le site public (aucune écriture possible), 401 sans session en local.
 *
 *   POST { ids: ["jean-dupont"], status: "officiel", statusUrl?: "https://www.conseil-constitutionnel.fr/..." }
 *   POST { ids: ["jean-dupont"], scope: "in" | "out", reason: "..." }   (périmètre : partis avec députés)
 */
export async function POST(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { ids?: unknown; status?: unknown; statusUrl?: unknown; scope?: unknown; reason?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
  if (body?.scope !== undefined) {
    if (!ids.length) return Response.json({ error: "ids manquants" }, { status: 400 });
    if (body.scope !== "in" && body.scope !== "out") return Response.json({ error: "scope invalide (in | out)" }, { status: 400 });
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "Décision de l'administrateur";
    return Response.json({ ok: true, updated: setCandidateScope(ids, body.scope, reason) });
  }
  const status = body?.status as CandidateStatus;
  if (!ids.length) return Response.json({ error: "ids manquants" }, { status: 400 });
  if (!CANDIDATE_STATUSES.includes(status)) return Response.json({ error: `statut invalide (attendu : ${CANDIDATE_STATUSES.join(", ")})` }, { status: 400 });
  const statusUrl = typeof body?.statusUrl === "string" && /^https?:\/\//.test(body.statusUrl) ? body.statusUrl : undefined;
  if (status === "officiel" && !statusUrl) return Response.json({ error: "statusUrl requis pour « officiel » (lien vers la décision du Conseil constitutionnel)" }, { status: 400 });
  const updated = setCandidateStatus(ids, status, statusUrl);
  return Response.json({ ok: true, updated });
}
