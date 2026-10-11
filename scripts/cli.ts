/**
 * CLI Cohérence-Politique — mêmes jobs que l'interface, utilisables en ligne de commande / cron.
 *
 *   npm run job -- ingest-an
 *   npm run job -- classify-scrutins --limit 200
 *   npm run job -- synthesize --force
 *   npm run job -- explain-votes --uid VTANR5L17V8536,VTANR5L17V8537
 *   npm run job -- refresh-all --budget 40
 *   npm run job -- candidats --limit 2                (liste + 2 fiches manquantes)
 *   npm run job -- candidats --ids jean-dupont --force --no-list
 *   npm run job -- candidats --justice --ids jean-dupont     (refaire seulement la rubrique judiciaire vérifiée)
 *   npm run job -- candidats --ids jean-dupont --set-scope in --scope-reason "..."
 *   npm run job -- candidats --ids jean-dupont --set-status officiel --status-url https://www.conseil-constitutionnel.fr/...
 */
import "dotenv/config";
import { launchJob, JOB_KINDS, type JobKind } from "../src/lib/pipeline";
import { waitJob } from "../src/lib/jobs";

async function main() {
  const [kind, ...rest] = process.argv.slice(2);
  if (!kind || !(kind in JOB_KINDS)) {
    console.log("Jobs disponibles :\n" + Object.entries(JOB_KINDS).map(([k, v]) => `  ${k.padEnd(20)} ${v.label} — ${v.desc}`).join("\n"));
    process.exit(kind ? 1 : 0);
  }
  const params: Record<string, unknown> = {};
  let budget: number | undefined;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--limit") params.limit = Number(rest[++i]);
    else if (a === "--chamber") params.chamber = rest[++i];
    else if (a === "--party") params.partyIds = rest[++i].split(",");
    else if (a === "--theme") params.themes = rest[++i].split(",");
    else if (a === "--force") params.force = true;
    else if (a === "--uid") params.uids = rest[++i].split(",");
    else if (a === "--budget") budget = Number(rest[++i]);
    else if (a === "--ids") params.ids = rest[++i].split(",");
    else if (a === "--list") params.list = true;
    else if (a === "--no-list") params.list = false;
    else if (a === "--set-status") params.setStatus = rest[++i];
    else if (a === "--status-url") params.statusUrl = rest[++i];
    else if (a === "--rescope") params.rescope = true;
    else if (a === "--justice") params.justice = true;
    else if (a === "--set-scope") params.setScope = rest[++i];
    else if (a === "--scope-reason") params.scopeReason = rest[++i];
  }
  const { id, error } = launchJob(kind as JobKind, params, budget);
  if (error || !id) {
    console.error(error);
    process.exit(1);
  }
  const job = await waitJob(id);
  console.log(`\n${job?.status?.toUpperCase()} — ${job?.message} — coût Claude ${job?.costUsd.toFixed(2)} $ (${job?.inputTokens} in / ${job?.outputTokens} out, ${job?.cacheReadTokens} cache)`);
  process.exit(job?.status === "done" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
