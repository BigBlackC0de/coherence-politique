import Link from "next/link";
import { notFound } from "next/navigation";
import { themeDetail } from "@/lib/queries";
import { THEME_BY_ID } from "@/lib/config/themes";
import { themePlain } from "@/lib/config/plain";
import { Card, PageHeader, SectionTitle, Verdict, Position, Salience, fmtDate, Empty } from "@/components/ui";
import { AlignmentLegend, AlignmentRow } from "@/components/alignment";
import { allAlignments } from "@/lib/queries-ecarts";
import { Help } from "@/components/help";
import { ShareButton } from "@/components/share-button";
import { shareImage } from "@/lib/share/paths";
import { themeMetadata } from "@/lib/share/meta";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/themes/[id]">) {
  return themeMetadata((await props.params).id);
}

export default async function ThemePage(props: PageProps<"/themes/[id]">) {
  const { id } = await props.params;
  const theme = THEME_BY_ID[id];
  if (!theme) notFound();
  const pl = themePlain(id);
  const { parties, scrutins } = themeDetail(id);
  const withData = parties.filter((p) => p.votedStance !== null || p.declaredStance !== null);
  const align = allAlignments();
  const columns = parties.filter((p) => scrutins.some((s) => s.positions[p.id]));

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Sujet" title={`${theme.emoji} ${theme.label}`} description={pl.question} actions={<ShareButton image={shareImage.sujet(id)} title={`${theme.label} : où sont les partis ?`} filename={`coherence-sujet-${id}`} />}>
        <div className="grid sm:grid-cols-2 gap-3 mt-4 max-w-3xl text-sm">
          <div className="rounded-2xl p-3 bg-left/10">
            <div className="font-bold text-left">← {pl.left}</div>
            <div className="text-xs text-ink-2 mt-1">{theme.poleLeft}</div>
          </div>
          <div className="rounded-2xl p-3 bg-right/10">
            <div className="font-bold text-right">{pl.right} →</div>
            <div className="text-xs text-ink-2 mt-1">{theme.poleRight}</div>
          </div>
        </div>
        <p className="text-xs text-ink-3 mt-3">Exemples : {pl.examples}. « Gauche » et « droite » servent à comparer, ce n&apos;est pas un jugement.</p>
      </PageHeader>

      <section className="space-y-4">
        <SectionTitle
          title={
            <>
              Font-ils ce qu&apos;ils disent ? <Help k="verdict" />
            </>
          }
        />
        <AlignmentLegend />
          {withData.length === 0 ? (
            <Empty>Pas encore de position calculée sur ce sujet.</Empty>
          ) : (
            <div className="grid md:grid-cols-2 gap-3 [&>*]:min-w-0">
              {parties.map((p) => {
                const a = align.get(`${p.id}|${id}`);
                if (!a) return null;
                return (
                  <AlignmentRow
                    key={p.id}
                    a={a}
                    themeId={id}
                    partyId={p.id}
                    partyShort={p.short_name}
                    showScale
                    className="bg-surface"
                    head={
                      <>
                        <Link href={`/partis/${p.id}`} className="flex items-center gap-2 font-bold hover:underline">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} /> {p.name}
                        </Link>
                        <Verdict v={p.verdict} />
                      </>
                    }
                    right={<ShareButton size="sm" image={shareImage.partiSujet(p.id, id)} url={`/partis/${p.id}#${id}`} title={`${p.name} et le sujet « ${theme.label} » : ce qu'il dit, ce qu'il vote`} filename={`coherence-${p.id}-${id}`} />}
                  >
                    {p.narrative && (
                      <details className="mt-2">
                        <summary className="text-xs font-semibold text-accent-ink cursor-pointer hover:underline">Lire l&apos;explication</summary>
                        <p className="text-sm text-ink-2 mt-2 leading-relaxed">{p.narrative}</p>
                      </details>
                    )}
                  </AlignmentRow>
                );
              })}
            </div>
          )}
      </section>

      <Card
        title={
          <>
            Les votes les plus importants sur ce sujet <Help k="importance" />
          </>
        }
        subtitle={`${scrutins.length} votes · ce qu'a voté la majorité des élus de chaque parti`}
      >
        {scrutins.length === 0 ? (
          <Empty>Pas encore de vote sur ce sujet.</Empty>
        ) : (
          <div className="overflow-x-auto -mx-4 md:-mx-5 px-4 md:px-5">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vote</th>
                  <th>Voter pour, c&apos;est aller vers…</th>
                  {columns.map((p) => (
                    <th key={p.id} className="!text-center">
                      <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: p.color }} />
                      {p.short_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scrutins.map((s) => (
                  <tr key={s.uid} className="align-top">
                    <td className="whitespace-nowrap text-xs text-ink-3">
                      {fmtDate(s.date)}
                      <br />
                      {s.chamber === "SENAT" ? "Sénat" : "Assemblée"}
                    </td>
                    <td className="min-w-[280px]">
                      <Link href={`/scrutins/${s.uid}`} className="hover:underline font-semibold">
                        {s.summary}
                      </Link>
                      <div className="text-xs text-ink-3 mt-0.5 flex items-center gap-2">
                        <Salience s={s.salience} /> {s.sort}
                      </div>
                    </td>
                    <td className="text-xs whitespace-nowrap">{s.direction === 1 ? <span className="text-right font-semibold">{pl.right} →</span> : s.direction === -1 ? <span className="text-left font-semibold">← {pl.left}</span> : <span className="text-ink-3">ni l&apos;un ni l&apos;autre</span>}</td>
                    {columns.map((p) => (
                      <td key={p.id} className="!text-center">
                        <Position p={s.positions[p.id]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
