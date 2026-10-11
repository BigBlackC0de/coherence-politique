import Link from "next/link";
import { dataStatus, allParties, usageByTask } from "@/lib/queries";
import { JOB_KINDS } from "@/lib/pipeline";
import { xConfigured } from "@/lib/x/client";
import { engineInfo } from "@/lib/llm";
import { Card } from "@/components/ui";
import { JobsPanel } from "@/components/jobs-panel";
import { AddDocumentForm, ImportPostsForm } from "@/components/import-forms";
import { JobButton } from "@/components/job-button";
import { requireAdmin } from "@/lib/auth";
import { adminTodo } from "@/lib/todo";
import { KIND_LABEL } from "@/lib/ingest/cri-an";
import { getDb, schema } from "@/lib/db";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function SourcesPage(props: PageProps<"/sources">) {
  await requireAdmin("/sources");
  const sp = await props.searchParams;
  const status = dataStatus();
  const todo = adminTodo();
  const lastRefresh = (getDb().all(sql`SELECT MAX(finished_at) AS d FROM jobs WHERE kind = 'refresh-all' AND status = 'done'`)[0] as { d: string | null } | undefined)?.d ?? null;
  const parties = allParties();
  const usage = usageByTask();
  const x = xConfigured();
  const eng = engineInfo();
  const claudeReady = eng.ready;
  const docs = getDb().select().from(schema.documents).orderBy(desc(schema.documents.id)).limit(40).all();
  const xMsg = (Array.isArray(sp.x) ? sp.x[0] : sp.x) as string | undefined;
  const postsByKind = getDb()
    .all(sql`SELECT kind, source, COUNT(*) AS n, SUM(CASE WHEN id IN (SELECT post_id FROM post_analyses) THEN 1 ELSE 0 END) AS analyzed FROM posts GROUP BY kind, source ORDER BY n DESC`)
    .map((r) => r as { kind: string; source: string; n: number; analyzed: number });

  const stat = (label: string, value: string | number, hint?: string) => (
    <div className="card p-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{typeof value === "number" ? value.toLocaleString("fr-FR") : value}</div>
      {hint && <div className="text-[11px] text-ink-3">{hint}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="rise">
        <div className="eyebrow">Espace administration</div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">Données & jobs</h1>
        <p className="text-sm text-ink-2 mt-2">
          Moteur : <strong>{eng.engine === "claude-code" ? "Claude Code (abonnement Claude du compte connecté, sans facturation à l'acte)" : "API Anthropic (clé API, facturation à l'usage)"}</strong>
          {eng.ready ? "" : eng.engine === "claude-code" ? " — exécutable `claude` introuvable" : " — clé API absente"} · modèle principal : <code>{eng.modelMain}</code> · masse : <code>{eng.modelBulk}</code> · valeur équivalente consommée : <strong>{status.costTotal.toFixed(2)} $</strong> (30 j : {status.cost30d.toFixed(2)} $)
        </p>
      </div>

      <section className="card p-5 md:p-6 border-accent/40 flex flex-col md:flex-row md:items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold tracking-tight">Tout mettre à jour</h2>
          <p className="text-sm text-ink-2 mt-1">
            Un seul bouton pour suivre l&apos;actualité : nouveaux votes et élus, comptes rendus et débats, communiqués, explications des nouveaux votes, verdicts, et chaque semaine la liste des candidats (nouvelles candidatures, renoncements). Les étapes déjà faites ne sont pas refaites ; si un job dédié tourne déjà, son étape est sautée.
          </p>
          <p className="text-xs text-ink-3 mt-1">Dernière mise à jour complète : {lastRefresh ? new Date(lastRefresh).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : "jamais"} · à lancer idéalement une fois par jour ou par semaine.</p>
        </div>
        <JobButton kind="refresh-all" label="Tout mettre à jour" budgetUsd={150} />
      </section>

      <Card title="Ce qu’il reste à faire" subtitle="calculé sur l’état de la base ; lancez de haut en bas">
        <ol className="space-y-2">
          {todo.map((t, i) => (
            <li key={i} className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 ${t.level === "urgent" ? "border-accent/40 bg-accent-soft" : t.level === "fait" ? "border-border opacity-70" : "border-border bg-surface-2/50"}`}>
              <span className="text-lg" aria-hidden>{t.level === "fait" ? "✅" : t.level === "urgent" ? "👉" : "➕"}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">{t.title}</div>
                <div className="text-xs text-ink-2">{t.why}</div>
              </div>
              {t.kind && <JobButton kind={t.kind} label="Lancer" />}
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {stat("Députés actifs", status.deputes)}
        {stat("Sénateurs actifs", status.senateurs, "groupes : historique officiel du Sénat")}
        {stat("Scrutins AN", status.scrutinsAN, `dernier : ${status.lastScrutin ?? "—"}`)}
        {stat("Scrutins Sénat", status.scrutinsSenat, "depuis juillet 2024")}
        {stat("Votes individuels", status.votes)}
        {stat("Scrutins classifiés", `${status.classified} / ${status.scrutinsAN + status.scrutinsSenat}`)}
        {stat("Programmes", `${status.documentsAnalyzed} / ${status.documents}`, "analysés / trouvés")}
        {stat("Prises de parole", `${status.postsAnalyzed} / ${status.posts}`, "analysées / importées")}
        {stat("Affirmations vérifiées", status.claims)}
        {stat("Synthèses dire/faire", status.syntheses, "sur 143 cellules")}
      </div>

      <Card title="Jobs">
        <JobsPanel kinds={Object.entries(JOB_KINDS).map(([id, v]) => ({ id, ...v }))} claudeReady={claudeReady} engine={eng.engine} />
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Prises de parole officielles (gratuit)">
          <p className="text-sm text-ink-2">
            Ce que les élus <strong>disent</strong> vient des comptes rendus intégraux des séances publiques (Assemblée nationale et Sénat, open data) et des communiqués officiels des partis (flux RSS). Chaque intervention est rattachée au parlementaire qui la prononce. Les questions au gouvernement et les explications de vote sont analysées en priorité.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <JobButton kind="ingest-cri" label="Importer les séances AN + Sénat" />
            <JobButton kind="ingest-rss" label="Importer les communiqués" />
          </div>
          {postsByKind.length > 0 && (
            <table className="w-full text-xs mt-3">
              <thead>
                <tr className="text-ink-3 text-left">
                  <th className="py-1 font-medium">Nature</th>
                  <th className="py-1 font-medium">Source</th>
                  <th className="py-1 font-medium text-right">Importées</th>
                  <th className="py-1 font-medium text-right">Analysées</th>
                </tr>
              </thead>
              <tbody>
                {postsByKind.map((r) => (
                  <tr key={`${r.kind}-${r.source}`} className="border-t border-border tabular-nums">
                    <td className="py-1">{KIND_LABEL[r.kind] ?? r.kind}</td>
                    <td className="py-1 text-ink-3">{r.source}</td>
                    <td className="py-1 text-right">{r.n.toLocaleString("fr-FR")}</td>
                    <td className="py-1 text-right">{r.analyzed.toLocaleString("fr-FR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3 className="font-medium text-sm mt-5 mb-1">X / Twitter (optionnel, payant)</h3>
          {xMsg && <p className="text-sm mb-2 text-ink-2">{xMsg}</p>}
          <p className="text-xs text-ink-3">
            Depuis février 2026, l&apos;API X n&apos;a plus de palier gratuit : lecture facturée ≈ 0,005 $ / tweet (paiement à l&apos;usage sur{" "}
            <a href="https://developer.x.com" className="underline" target="_blank" rel="noreferrer">
              developer.x.com
            </a>
            ). Deux modes : connecter votre compte (OAuth, recommandé) ou un bearer token d&apos;application. Le plafond <code>X_MAX_READS_PER_REFRESH</code> borne le coût.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 items-center text-sm">
            {x.connected ? (
              <>
                <span className="text-good">● Compte X connecté</span>
                <form action="/api/x/disconnect" method="post">
                  <button className="underline text-ink-3 text-xs">déconnecter</button>
                </form>
              </>
            ) : x.oauth ? (
              <a href="/api/x/auth" className="rounded bg-ink text-bg px-3 py-1.5">
                Connecter mon compte X
              </a>
            ) : (
              <span className="text-ink-3 text-xs">Renseignez X_CLIENT_ID / X_CLIENT_SECRET dans .env pour activer la connexion.</span>
            )}
            {x.bearer && <span className="text-xs text-ink-3">· bearer token configuré</span>}
          </div>
          <h3 className="font-medium text-sm mt-4 mb-1">Import manuel (sans API)</h3>
          <ImportPostsForm parties={parties} />
        </Card>

        <Card title="Programmes des partis">
          <p className="text-sm text-ink-2">
            Cohérence-Politique cherche sur le web les programmes officiels de chaque parti (PDF et pages officielles), les lit intégralement et positionne chaque thème. Relancer ne refait que le manquant.
          </p>
          <JobButton kind="programmes" label="Chercher et analyser les programmes des 11 partis" className="mt-3" />
          <h3 className="font-medium text-sm mt-5 mb-1">Ajouter une source à la main</h3>
          <p className="text-xs text-ink-3 mb-2">URL d&apos;un PDF ou d&apos;une page, ou texte collé. Puis « Analyser les programmes ».</p>
          <AddDocumentForm parties={parties} />
          <h3 className="font-medium text-sm mt-4 mb-1">Documents ({docs.length} derniers)</h3>
          <ul className="text-xs space-y-1 max-h-72 overflow-y-auto">
            {docs.map((d) => (
              <li key={d.id} className="flex gap-2 items-start">
                <span className={`rounded px-1 ${d.status === "analyzed" ? "bg-good/10 text-good" : d.status === "error" ? "bg-bad/10 text-bad" : "bg-surface-2 text-ink-3"}`}>{d.status}</span>
                <Link href={`/partis/${d.partyId}`} className="text-ink-3 shrink-0 hover:underline">
                  {parties.find((p) => p.id === d.partyId)?.shortName}
                </Link>
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="hover:underline truncate">
                    {d.title}
                  </a>
                ) : (
                  <span className="truncate">{d.title}</span>
                )}
                {d.error && <span className="text-warn truncate">{d.error}</span>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title={eng.engine === "claude-code" ? "Consommation IA par tâche (valeur équivalente, incluse dans l'abonnement)" : "Dépenses IA par tâche"}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-3 text-left">
              <th className="py-1 font-medium">Tâche</th>
              <th className="py-1 font-medium">Modèle</th>
              <th className="py-1 font-medium text-right">Appels</th>
              <th className="py-1 font-medium text-right">Entrée</th>
              <th className="py-1 font-medium text-right">Cache</th>
              <th className="py-1 font-medium text-right">Sortie</th>
              <th className="py-1 font-medium text-right">Coût</th>
            </tr>
          </thead>
          <tbody>
            {usage.map((u) => (
              <tr key={`${u.task}-${u.model}`} className="border-t border-border tabular-nums">
                <td className="py-1">{u.task}</td>
                <td className="py-1 text-ink-3">{u.model}</td>
                <td className="py-1 text-right">{u.calls}</td>
                <td className="py-1 text-right">{(u.input / 1000).toFixed(0)}k</td>
                <td className="py-1 text-right">{(u.cache / 1000).toFixed(0)}k</td>
                <td className="py-1 text-right">{(u.output / 1000).toFixed(0)}k</td>
                <td className="py-1 text-right font-medium">{u.cost.toFixed(2)} $</td>
              </tr>
            ))}
            {usage.length === 0 && (
              <tr>
                <td colSpan={7} className="py-2 text-ink-3 text-xs">
                  Aucune dépense pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Sources et méthode">
        <ul className="text-sm space-y-1 text-ink-2 list-disc pl-5">
          <li>
            <strong>Assemblée nationale</strong> : open data officiel (data.assemblee-nationale.fr), XVIIe législature — députés, groupes, parti déclaré, scrutins et votes nominatifs. Mis à jour quotidiennement par l&apos;AN ; relancez « Importer » pour récupérer les nouveaux scrutins.
          </li>
          <li>
            <strong>Sénat</strong> : NosParlementaires (Licence Ouverte 2.0), qui normalise data.senat.fr. Les groupes des sénateurs élus en septembre 2026 ne sont pas encore publiés.
          </li>
          <li>
            <strong>Positions votées</strong> : pour chaque scrutin de fond, Cohérence-Politique détermine les thèmes et le sens d&apos;un vote POUR sur l&apos;axe ; la position d&apos;un parti est la moyenne pondérée (par importance) des positions majoritaires de son groupe. Les votes de procédure sont exclus.
          </li>
          <li>
            <strong>Positions déclarées</strong> : analyse des programmes officiels (PDF lus intégralement par Cohérence-Politique), pondérée par la confiance.
          </li>
          <li>
            <strong>Prises de parole</strong> : comptes rendus intégraux des séances publiques (open data AN, format Syceron ; data.senat.fr, Licence Ouverte) et flux RSS officiels des partis. Seules les interventions substantielles des parlementaires sont retenues (questions au gouvernement, explications de vote, discussions générales, motions, débats longs) ; les ministres et les interruptions sont exclus.
          </li>
          <li>
            <strong>Assiduité</strong> : présence aux scrutins publics depuis le début du mandat (voir la page Assiduité pour la méthode et ses limites).
          </li>
          <li>
            <strong>Limites</strong> : un vote CONTRE un texte adverse n&apos;est pas toujours un désaccord de fond (logique majorité/opposition) ; les synthèses le signalent. L&apos;orientation des axes est une convention. Vérifiez les preuves citées.
          </li>
        </ul>
      </Card>
    </div>
  );
}
