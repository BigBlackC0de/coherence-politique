/**
 * Veille parlementaire planifiable : vérifie l'Assemblée et le Sénat, traite les nouveaux scrutins,
 * puis republie le site public si quelque chose a changé.
 *
 *   npm run veille                      # budget 20 $ équiv., publie si nouveauté et si COHERENCE_PUBLISH_URL est défini
 *   npm run veille -- --budget 10       # plafond de coût plus bas
 *   npm run veille -- --no-publish      # analyse seulement, sans publier
 *
 * Code de sortie : 0 = passage réussi (nouveauté ou non), 1 = échec (job ou publication).
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { launchJob } from "../src/lib/pipeline";
import { waitJob } from "../src/lib/jobs";
import { getSqlite } from "../src/lib/db";
import { VEILLE_KEY, type VeilleReport } from "../src/lib/veille";

async function main() {
  const args = process.argv.slice(2);
  const bi = args.indexOf("--budget");
  const budget = bi >= 0 ? Number(args[bi + 1]) : 20;
  const publish = !args.includes("--no-publish");

  const { id, error } = launchJob("veille", {}, budget);
  if (error || !id) {
    console.error(error);
    process.exit(1);
  }
  const job = await waitJob(id);
  console.log(`\n${job?.status?.toUpperCase()} — ${job?.message} — coût Claude ${job?.costUsd.toFixed(2)} $ équiv.`);
  if (job?.status !== "done") process.exit(1);

  const row = getSqlite().prepare(`SELECT value FROM settings WHERE key = ?`).get(VEILLE_KEY) as { value: string } | undefined;
  const report = row ? (JSON.parse(row.value) as VeilleReport) : null;
  if (!report?.changed) {
    console.log("Rien de nouveau : pas de publication.");
    process.exit(0);
  }
  console.log(`Nouveautés : ${report.newAN} AN, ${report.newSenat} Sénat, ${report.classified} classés, ${report.explained} expliqués, thèmes : ${report.themesRefreshed.join(", ") || "aucun"}`);
  if (!publish) {
    console.log("--no-publish : le site public n'est pas mis à jour.");
    process.exit(0);
  }
  if (!process.env.COHERENCE_PUBLISH_URL) {
    console.log("COHERENCE_PUBLISH_URL non défini : le site public n'est pas mis à jour (lancez npm run publish).");
    process.exit(0);
  }
  try {
    execSync("npm run publish", { stdio: "inherit" });
  } catch {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
