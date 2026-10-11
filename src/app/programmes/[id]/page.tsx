import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Quote } from "lucide-react";
import { programmeDetail } from "@/lib/queries-library";
import { Card, Empty, StanceBar } from "@/components/ui";
import { Explain, Help } from "@/components/help";
import { THEMES } from "@/lib/config/themes";
import { stanceWords, themePlain } from "@/lib/config/plain";

export const dynamic = "force-dynamic";

export default async function ProgrammePage(props: PageProps<"/programmes/[id]">) {
  const { id } = await props.params;
  const docId = Number(id);
  if (!Number.isInteger(docId)) notFound();
  const d = programmeDetail(docId);
  if (!d) notFound();
  const { doc, party, summary, analyses, others } = d;
  const byTheme = new Map(analyses.map((a) => [a.theme, a]));
  const covered = THEMES.filter((t) => byTheme.get(t.id)?.stance !== null && byTheme.get(t.id)?.stance !== undefined);
  const missing = THEMES.filter((t) => !covered.includes(t));
  const color = party?.color ?? "var(--border-2)";

  return (
    <div className="space-y-8">
      <Link href="/programmes" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={14} /> Tous les programmes
      </Link>

      {/* ---- En-tête ---- */}
      <section className="card overflow-hidden rise">
        <div className="h-2" style={{ background: color }} />
        <div className="p-5 md:p-8">
          {party && (
            <Link href={`/partis/${party.id}`} className="eyebrow inline-flex items-center gap-1.5 hover:underline">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              {party.name}
            </Link>
          )}
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight mt-2 break-words">{doc.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-2">
            {summary?.period && <span>{summary.period}</span>}
            {doc.url && (
              <a href={doc.url} target="_blank" rel="noreferrer" className="btn-secondary text-sm">
                Lire le document officiel <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      </section>

      {doc.status !== "analyzed" && <Explain tone="warn" title="Pas encore lu">Ce document n&apos;a pas encore été lu. Vous pouvez le consulter sur le site du parti, avec le lien ci-dessus.</Explain>}

      {/* ---- Synthèse ---- */}
      {summary?.summary && (
        <Card title="En résumé" subtitle="les grandes idées du document">
          <p className="text-[15px] md:text-base leading-relaxed text-ink">{summary.summary}</p>
        </Card>
      )}

      {/* ---- Par catégorie ---- */}
      {analyses.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">Ce qu&apos;il propose, sujet par sujet</h2>
            <p className="text-sm text-ink-2 mt-1">
              Pour chaque sujet : où se place le document, ce qu&apos;il propose, et quelques phrases du texte. « Gauche » et « droite » servent à comparer, ce n&apos;est pas un jugement. <Help k="position-declaree" />
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {covered.map((t) => {
              const a = byTheme.get(t.id)!;
              const w = stanceWords(t.id, a.stance);
              const p = themePlain(t.id);
              const thin = a.measures.length === 0 && a.quotes.length === 0;
              return (
                <Card key={t.id} id={t.id}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none" aria-hidden>
                      {t.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold tracking-tight">
                        <Link href={`/themes/${t.id}`} className="hover:underline">
                          {t.label}
                        </Link>
                      </h3>
                      <p className="text-xs text-ink-3 mt-0.5">{p.question}</p>
                    </div>
                  </div>

                  {w && (
                    <div className="mt-4">
                      <p className="text-sm">
                        <span className="text-ink-3">Position : </span>
                        <strong>{w.text}</strong>
                        {a.confidence < 0.4 && <span className="text-xs text-ink-3"> (le texte reste vague sur ce point)</span>}
                      </p>
                      <div className="mt-2">
                        <StanceBar declared={a.stance} themeId={t.id} showScale />
                      </div>
                    </div>
                  )}

                  {a.summary && <p className="mt-4 text-sm leading-relaxed text-ink-2">{a.summary}</p>}

                  {a.measures.length > 0 && (
                    <div className="mt-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-ink-3 mb-1.5">Ce qu&apos;il propose</div>
                      <ul className="space-y-1.5 text-sm">
                        {a.measures.map((m, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} aria-hidden />
                            <span className="min-w-0 break-words">{m}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {a.quotes.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">Dans le texte</div>
                      {a.quotes.map((q, i) => (
                        <blockquote key={i} className="flex gap-2 rounded-xl bg-surface-2 p-3 text-sm italic text-ink-2">
                          <Quote size={14} className="shrink-0 mt-0.5 text-ink-3" aria-hidden />
                          <span className="min-w-0 break-words">« {q} »</span>
                        </blockquote>
                      ))}
                    </div>
                  )}

                  {thin && <p className="mt-4 text-xs text-ink-3">Le document en parle peu : pas de mesure précise ni de passage marquant à citer.</p>}
                </Card>
              );
            })}
          </div>

          {missing.length > 0 && (
            <Card title="Les sujets dont ce document ne parle pas (ou très peu)">
              <div className="flex flex-wrap gap-2">
                {missing.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1 text-xs rounded-full bg-surface-2 border border-border px-2.5 py-1 text-ink-3">
                    <span aria-hidden>{t.emoji}</span> {t.label}
                  </span>
                ))}
              </div>
              <p className="text-xs text-ink-3 mt-3">Cela ne veut pas dire que le parti n&apos;a pas d&apos;avis : il peut l&apos;exprimer dans un autre document.</p>
            </Card>
          )}
        </div>
      )}

      {doc.status === "analyzed" && analyses.length === 0 && <Empty>Ce document a été lu, mais aucun sujet n&apos;a pu en être tiré.</Empty>}

      {/* ---- Autres documents ---- */}
      {party && (
        <Card title={`Les autres documents de ${party.name}`}>
          {others.length === 0 ? (
            <p className="text-sm text-ink-3">Aucun autre document lu pour ce parti.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {others.map((o) => (
                <li key={o.id}>
                  <Link href={`/programmes/${o.id}`} className="hover:underline break-words">
                    {o.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/partis/${party.id}`} className="btn-secondary text-sm">
              Sa fiche : ce qu&apos;il dit, ce qu&apos;il vote
            </Link>
            <Link href={`/prises-de-parole?parti=${party.id}`} className="btn-ghost text-sm">
              Ses prises de parole
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
