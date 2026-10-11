import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";
import { NextRequest } from "next/server";
import { assertPublishToken } from "@/lib/auth";
import { dbPath, closeDb, getSqlite } from "@/lib/db";

export const maxDuration = 600;

/**
 * Publication de la base : le propriétaire pousse, depuis sa machine (où tournent les analyses
 * couvertes par son abonnement Claude), une copie de `coherence.db` vers le site public.
 *   PUT /api/admin/db   Authorization: Bearer <COHERENCE_ADMIN_TOKEN>   body = fichier SQLite
 * La copie est vérifiée (integrity_check, tables attendues) avant de remplacer la base en service.
 */
export async function PUT(req: NextRequest) {
  const denied = await assertPublishToken();
  if (denied) return denied;
  if (!req.body) return Response.json({ error: "corps vide" }, { status: 400 });
  const target = dbPath();
  const tmp = `${target}.upload`;
  const bak = `${target}.bak`;
  try {
    await pipeline(Readable.fromWeb(req.body as unknown as import("node:stream/web").ReadableStream), fs.createWriteStream(tmp));
    const size = fs.statSync(tmp).size;
    if (size < 1_000_000) throw new Error(`fichier trop petit (${size} octets)`);
    const check = new Database(tmp, { readonly: true });
    try {
      const integrity = (check.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
      if (integrity !== "ok") throw new Error(`integrity_check : ${integrity}`);
      const tables = new Set((check.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name));
      for (const t of ["parties", "politicians", "scrutins", "votes", "party_theme_scores"]) if (!tables.has(t)) throw new Error(`table manquante : ${t}`);
    } finally {
      check.close();
    }
    // Bascule atomique : on ferme la connexion courante, on remplace le fichier, la prochaine requête rouvre.
    try {
      getSqlite().pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      /* base peut-être absente */
    }
    closeDb();
    for (const ext of ["-wal", "-shm"]) if (fs.existsSync(target + ext)) fs.rmSync(target + ext);
    if (fs.existsSync(target)) fs.renameSync(target, bak);
    fs.renameSync(tmp, target);
    const counts = getSqlite().prepare("SELECT (SELECT COUNT(*) FROM scrutins) scrutins, (SELECT COUNT(*) FROM posts) posts, (SELECT COUNT(*) FROM documents) documents, (SELECT COUNT(*) FROM party_theme_scores WHERE narrative IS NOT NULL) syntheses").get();
    return Response.json({ ok: true, bytes: size, counts, publishedAt: new Date().toISOString() });
  } catch (e) {
    if (fs.existsSync(tmp)) fs.rmSync(tmp);
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function GET() {
  const denied = await assertPublishToken();
  if (denied) return denied;
  const target = dbPath();
  const st = fs.existsSync(target) ? fs.statSync(target) : null;
  return Response.json({ path: path.basename(target), bytes: st?.size ?? 0, modifiedAt: st?.mtime.toISOString() ?? null });
}
