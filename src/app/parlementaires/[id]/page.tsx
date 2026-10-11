import Link from "next/link";
import { notFound } from "next/navigation";
import { politicianDetail } from "@/lib/queries";
import { THEMES } from "@/lib/config/themes";
import { Card, OfficialLink, StanceBar, Position, Salience, ThemeChip, fmtDate, fmtStance, Empty } from "@/components/ui";
import { Help } from "@/components/help";
import { stanceWords, POST_KIND_PLAIN as KIND_LABEL } from "@/lib/config/plain";
import { ShareButton } from "@/components/share-button";
import { shareImage } from "@/lib/share/paths";
import { politicianMetadata } from "@/lib/share/meta";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/parlementaires/[id]">) {
  return politicianMetadata((await props.params).id);
}

export default async function PoliticianPage(props: PageProps<"/parlementaires/[id]">) {
  const { id } = await props.params;
  const d = politicianDetail(id);
  if (!d) notFound();
  const { politician: p, party, scores, partyScores, votes, stats, posts } = d;
  const dissentRate = stats.compared ? stats.dissent / stats.compared : null;
  const absentRate = stats.total ? stats.absents / stats.total : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 rise">
        <span className="w-14 h-14 rounded-2xl shrink-0 flex items-center justify-center text-white text-lg font-extrabold shadow" style={{ background: party?.color ?? "var(--neutral)" }}>
          {p.firstName[0]}
          {p.lastName[0]}
        </span>
        <div>
          <div className="eyebrow">{p.chamber === "AN" ? "Député·e" : "Sénateur·rice"}</div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{p.fullName}</h1>
          <div className="text-ink-2 mt-1">
            {p.department ? `${p.department}${p.circo ? ` (${p.circo}e circonscription)` : ""} · ` : ""}groupe {p.groupName ?? p.groupAbbrev ?? "—"} <Help k="groupe" />
            {party && (
              <>
                {" · "}
                <Link href={`/partis/${party.id}`} className="underline">
                  {party.name}
                </Link>
              </>
            )}
            {p.parpol && p.parpol !== party?.name && <span className="text-ink-3"> (parti déclaré : {p.parpol})</span>}
          </div>
          {p.hatvpUrl && (
            <a href={p.hatvpUrl} target="_blank" rel="noreferrer" className="text-xs underline text-ink-3">
              déclaration d&apos;intérêts (Haute Autorité pour la transparence)
            </a>
          )}
          <div className="mt-3">
            <ShareButton image={shareImage.elu(p.id)} title={`${p.fullName} : présence aux votes et votes contre son groupe`} filename={`coherence-elu-${p.id}`} align="left" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="text-xs text-ink-3">Votes enregistrés</div>
          <div className="text-3xl font-extrabold num">{stats.total.toLocaleString("fr-FR")}</div>
          <div className="text-xs text-ink-3 mt-0.5">depuis le début du mandat en cours</div>
        </Card>
        <Card>
          <div className="text-xs text-ink-3">Présent sans voter <Help k="non-votant" /></div>
          <div className="text-3xl font-extrabold num">{absentRate === null ? "—" : `${Math.round(absentRate * 100)} %`}</div>
          <div className="text-xs text-ink-3 mt-0.5">part des votes où il ou elle n&apos;a pas pris part</div>
        </Card>
        <Card>
          <div className="text-xs text-ink-3">Vote autrement que son groupe</div>
          <div className="text-3xl font-extrabold num">{dissentRate === null ? "—" : `${(dissentRate * 100).toFixed(1)} %`}</div>
          <div className="text-xs text-ink-3 mt-0.5">{dissentRate === null ? "" : dissentRate < 0.02 ? "presque toujours comme son groupe" : dissentRate < 0.08 ? "parfois autrement" : "souvent autrement"}</div>
        </Card>
      </div>

      <Card title="Ses votes, sujet par sujet, comparés à son parti" subtitle="rond plein = cet élu · rond vide = ce que vote son parti · survolez pour lire en mots">
        {scores.length === 0 ? (
          <Empty>Pas encore de position calculée pour cet élu.</Empty>
        ) : (
          <div className="space-y-2">
            {THEMES.map((t) => {
              const s = scores.find((x) => x.theme === t.id);
              const ps = partyScores.find((x) => x.theme === t.id);
              if (!s) return null;
              return (
                <div key={t.id} className="grid md:grid-cols-[200px_1fr_180px] gap-3 items-center text-sm">
                  <Link href={`/themes/${t.id}`} className="hover:underline">
                    {t.emoji} {t.label}
                  </Link>
                  <StanceBar voted={s.votedStance} declared={ps?.votedStance} height={9} themeId={t.id} declaredLabel="Ce que vote son parti" declaredNeutral />
                  <div className="text-xs text-ink-3 num">
                    {stanceWords(t.id, s.votedStance)?.text ?? fmtStance(s.votedStance)} · {s.votedN} votes{s.dissentRate !== null ? ` · ${Math.round(s.dissentRate * 100)} % autrement que son groupe` : ""}
                    {s.votedN > 0 && (
                      <>
                        {" · "}
                        <Link href={`/parlementaires/${p.id}/calcul/${t.id}`} className="text-accent-ink font-semibold hover:underline">
                          le calcul
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Votes les plus importants">
        <ul className="space-y-2 text-sm">
          {votes.map((v) => (
            <li key={v.uid} className="flex gap-2 items-start">
              <span className="text-xs text-ink-3 w-20 shrink-0">{fmtDate(v.date)}</span>
              <span className="w-14 shrink-0">
                <Position p={v.position} />
              </span>
              <div className="min-w-0">
                <Link href={`/scrutins/${v.uid}`} className="hover:underline">
                  {v.summary ?? v.title}
                </Link>
                <div className="text-[11px] text-ink-3 flex flex-wrap gap-2 items-center">
                  <Salience s={v.salience} /> {v.theme && <ThemeChip id={v.theme} />} {v.sort}
                  {v.group_position && v.group_position !== v.position && v.position !== "nonVotant" && <span className="text-warn">son groupe : {v.group_position}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {posts.length > 0 && (
        <Card title="Ses dernières prises de parole">
          <ul className="space-y-2 text-sm">
            {posts.map((t) => (
              <li key={t.id} className="border-b border-border pb-2 last:border-0">
                <div className="text-xs text-ink-3 flex flex-wrap gap-2 items-center">
                  <span className="rounded bg-accent/10 text-accent-ink px-1">{KIND_LABEL[t.kind] ?? t.kind}</span>
                  <span>{fmtDate(t.createdAt)}</span>
                  {t.title && <span className="truncate max-w-[60%]" title={t.title}>{t.title}</span>}
                  {t.url && (
                    <OfficialLink href={t.url} an={p.chamber === "AN"} copied={t.text.length <= 900} className="underline ml-auto">
                      compte rendu officiel
                    </OfficialLink>
                  )}
                </div>
                <p className="whitespace-pre-wrap mt-1">{t.text.length > 900 ? `${t.text.slice(0, 900)} […]` : t.text}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
