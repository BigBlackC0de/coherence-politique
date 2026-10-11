/**
 * Publication de la base locale vers le site public.
 *
 *   npm run publish                # utilise COHERENCE_PUBLISH_URL et COHERENCE_ADMIN_TOKEN du .env
 *   npm run publish -- https://coherence-politique.example.org
 *
 * Étapes : copie cohérente (VACUUM INTO), allègement (PDF binaires et historique de chat retirés),
 * envoi en PUT /api/admin/db avec le jeton d'administration. Le serveur vérifie l'intégrité avant de basculer.
 */
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

async function main() {
  const url = (process.argv[2] ?? process.env.COHERENCE_PUBLISH_URL ?? "").replace(/\/$/, "");
  const token = process.env.COHERENCE_ADMIN_TOKEN;
  if (!url) throw new Error("URL du site manquante : COHERENCE_PUBLISH_URL dans .env ou en argument");
  if (!token) throw new Error("COHERENCE_ADMIN_TOKEN manquant dans .env (le même que sur le serveur)");
  const src = process.env.COHERENCE_DB_PATH ?? path.join(process.cwd(), "data", "coherence.db");
  const tmp = path.join(os.tmpdir(), `coherence-publish-${Date.now()}.db`);

  console.log(`Copie cohérente de ${src} …`);
  const db = new Database(src, { readonly: true });
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  db.close();

  console.log("Allègement de la copie (PDF binaires, chat) …");
  const copy = new Database(tmp);
  copy.exec("UPDATE documents SET pdf_base64 = NULL; DELETE FROM chat_messages; DELETE FROM jobs WHERE status = 'running'; VACUUM;");
  copy.close();
  const size = fs.statSync(tmp).size;
  console.log(`Envoi de ${(size / 1e6).toFixed(0)} Mo vers ${url}/api/admin/db …`);

  const res = await fetch(`${url}/api/admin/db`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream", "content-length": String(size) },
    body: fs.createReadStream(tmp) as unknown as ReadableStream,
    // @ts-expect-error — requis par Node pour un corps en flux
    duplex: "half",
  });
  const json = (await res.json()) as Record<string, unknown>;
  fs.rmSync(tmp, { force: true });
  if (!res.ok) throw new Error(`Serveur : ${res.status} ${JSON.stringify(json)}`);
  console.log("Publié ✔", JSON.stringify(json));
}

main().catch((e) => {
  console.error(`Échec : ${(e as Error).message}`);
  process.exit(1);
});
