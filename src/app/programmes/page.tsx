import Link from "next/link";
import { ArrowRight, ExternalLink, FileText } from "lucide-react";
import { programmesByParty } from "@/lib/queries-library";
import { PageHeader, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { programme: "Programme", manifeste: "Manifeste", communique: "Communiqué", manual: "Document", autre: "Document" };

export default async function ProgrammesPage() {
  const groups = programmesByParty();
  const analyzed = groups.reduce((a, g) => a + g.docs.filter((d) => d.status === "analyzed").length, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Ce qu'ils promettent"
        title="Les programmes"
        description={
          <>
            Les documents où chaque parti écrit ce qu&apos;il propose. Déjà {analyzed} lus et résumés, sujet par sujet.
          </>
        }
      />


      <div className="grid gap-5 md:grid-cols-2">
        {groups.map(({ party, docs }) => {
          const read = docs.filter((d) => d.status === "analyzed");
          const unread = docs.filter((d) => d.status !== "analyzed");
          return (
            <section key={party.id} className="card overflow-hidden flex flex-col">
              <div className="h-1.5" style={{ background: party.color }} />
              <div className="p-4 md:p-5 flex-1 flex flex-col">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold tracking-tight flex items-center gap-2 min-w-0">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: party.color }} />
                    <Link href={`/partis/${party.id}`} className="hover:underline truncate">
                      {party.name}
                    </Link>
                  </h2>
                  <span className="text-xs text-ink-3 shrink-0">
                    {read.length} lu{read.length > 1 ? "s" : ""}
                  </span>
                </div>

                {docs.length === 0 ? (
                  <div className="mt-3">
                    <Empty>Aucun programme trouvé pour l&apos;instant.</Empty>
                  </div>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {read.map((d) => (
                      <li key={d.id}>
                        <Link href={`/programmes/${d.id}`} className="group block rounded-xl border border-border bg-surface hover:bg-surface-2 hover:border-border-2 p-3 transition-colors">
                          <div className="flex items-start gap-2">
                            <FileText size={16} className="text-ink-3 mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm leading-snug break-words">{d.title}</div>
                              <div className="text-xs text-ink-3 mt-1 flex flex-wrap gap-x-2">
                                <span>{KIND_LABEL[d.kind] ?? "Document"}</span>
                                {d.period && <span>· {d.period}</span>}
                                <span>
                                  · {d.themesCovered} sujet{d.themesCovered > 1 ? "s" : ""} abordé{d.themesCovered > 1 ? "s" : ""}
                                </span>
                              </div>
                            </div>
                            <ArrowRight size={16} className="text-ink-3 group-hover:text-ink mt-0.5 shrink-0" />
                          </div>
                        </Link>
                      </li>
                    ))}
                    {unread.length > 0 && (
                      <li className="pt-1">
                        <details>
                          <summary className="text-xs text-ink-3 cursor-pointer hover:text-ink">
                            {unread.length} autre{unread.length > 1 ? "s" : ""} document{unread.length > 1 ? "s" : ""} repéré{unread.length > 1 ? "s" : ""} mais pas encore lu{unread.length > 1 ? "s" : ""}
                          </summary>
                          <ul className="mt-2 space-y-1.5">
                            {unread.map((d) => (
                              <li key={d.id} className="text-xs text-ink-2 break-words">
                                {d.url ? (
                                  <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 hover:underline">
                                    {d.title} <ExternalLink size={11} className="mt-0.5 shrink-0" />
                                  </a>
                                ) : (
                                  d.title
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
