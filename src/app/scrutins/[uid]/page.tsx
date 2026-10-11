import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowDown, ExternalLink, MessageCircleQuestion } from "lucide-react";
import { scrutinDetail } from "@/lib/queries";
import { isRecentDate, scrutinDebate } from "@/lib/queries-debates";
import { themePlain } from "@/lib/config/plain";
import { Card, OfficialLink, OFFICIAL_SITE_HINT, Position, Salience, ThemeChip, fmtDate } from "@/components/ui";
import { Donut, VoteStacks } from "@/components/charts";
import { Explain, Help } from "@/components/help";
import { ShareButton } from "@/components/share-button";
import { shareImage } from "@/lib/share/paths";
import { scrutinMetadata } from "@/lib/share/meta";
import { voteKind } from "@/lib/analysis/vote-kind";
import { GroupRule, KIND_LABEL, VoteCalc, dec, signed } from "@/components/calc";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/scrutins/[uid]">) {
  return scrutinMetadata((await props.params).uid);
}

export default async function ScrutinPage(props: PageProps<"/scrutins/[uid]">) {
  const { uid } = await props.params;
  const d = scrutinDetail(uid);
  if (!d) notFound();
  const { scrutin, analysis, groups, votes } = d;
  const debate = scrutinDebate(uid);
  const ex = debate?.explanation ?? null;
  const recent = isRecentDate(scrutin.date);
  const kind = voteKind(scrutin.title);
  const byPos = (pos: string) => votes.filter((v) => v.position === pos);
  const adopted = scrutin.sort === "adopté";
  const pour = scrutin.pour ?? 0;
  const contre = scrutin.contre ?? 0;
  const abst = scrutin.abstentions ?? 0;
  const votingGroups = groups.filter((g) => g.pour + g.contre + g.abstentions > 0);
  const explainedRef = new Set((ex?.groupes ?? []).filter((x) => x.raison || x.citation).map((x) => x.groupRef));
  const silent = votingGroups.filter((g) => !explainedRef.has(g.groupRef));
  const stacks = groups.map((g) => ({ name: g.party_name ?? g.group_name ?? g.groupAbbrev ?? g.groupRef, id: g.partyId ?? undefined, color: g.color ?? undefined, pour: g.pour, contre: g.contre, abstention: g.abstentions, nonVotant: g.nonVotants ?? 0 }));

  return (
    <div className="space-y-8">
      <div className="rise">
        <div className="eyebrow">
          {scrutin.chamber === "SENAT" ? "Sénat" : "Assemblée nationale"} · {fmtDate(scrutin.date)} · vote n° {scrutin.number}
        </div>
        <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight mt-2 leading-tight max-w-4xl">{ex?.titre ?? analysis?.summary ?? scrutin.title}</h1>
        {debate && (
          <a href="#pourquoi" className="btn-primary mt-5 !text-base !px-5 !py-3 !whitespace-normal text-left">
            <MessageCircleQuestion size={18} className="shrink-0" /> {ex ? "Pourquoi ils ont voté comme ça" : "Lire le débat avant le vote"} <ArrowDown size={16} className="shrink-0" />
          </a>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <span className={`pill !text-sm !py-1.5 ${adopted ? "!border-good/40 !bg-good/10 !text-good" : "!border-bad/40 !bg-bad/10 !text-bad"}`}>{adopted ? "✅ Adopté" : "❌ Rejeté"}</span>
          {analysis && <Salience s={analysis.salience} />}
          {analysis?.isProcedural && (
            <span className="pill" title="Un vote sur la façon de débattre (par exemple rejeter le texte sans l'examiner), pas sur son contenu.">
              vote de procédure
            </span>
          )}
          <ShareButton image={shareImage.vote(scrutin.uid)} title={`Vote : ${ex?.titre ?? analysis?.summary ?? scrutin.title}`} filename={`coherence-vote-${scrutin.uid}`} align="left" />
          <a href="#calcul" className="pill hover:underline">
            Voir le calcul <ArrowDown size={11} />
          </a>
          {scrutin.demandeur && <span className="text-xs text-ink-3">vote nom par nom demandé par {scrutin.demandeur}</span>}
          {scrutin.url && (
            <OfficialLink href={scrutin.url} an={scrutin.chamber === "AN"} className="pill hover:underline">
              Page officielle du vote <ExternalLink size={11} />
            </OfficialLink>
          )}
          {debate?.url && (
            <OfficialLink href={debate.url} an={scrutin.chamber === "AN"} copied className="pill hover:underline">
              Compte rendu officiel du débat <ExternalLink size={11} />
            </OfficialLink>
          )}
        </div>
        {scrutin.chamber === "AN" && !recent && (scrutin.url || debate?.url) && (
          <p className="text-xs text-ink-3 mt-2">
            {OFFICIAL_SITE_HINT}
            {debate ? " Le débat est de toute façon recopié plus bas." : ""}
          </p>
        )}
        {recent && scrutin.chamber === "AN" && (
          <p className="text-xs text-ink-3 mt-2">Vote récent : l&apos;Assemblée met sa page en ligne quelques jours après. Si le lien ne marche pas encore, pas d&apos;inquiétude : les chiffres ci-dessous viennent déjà de ses données officielles{debate ? ", et le débat est recopié plus bas" : ""}.</p>
        )}
      </div>

      {(ex?.enjeu || analysis?.stakes) && (
        <Explain title="En clair, ce vote décide…">
          {ex?.enjeu ?? analysis?.stakes}
          {ex?.siAdopte && <span className="block mt-1.5"><strong className="text-ink">Si c&apos;est adopté :</strong> {ex.siAdopte}</span>}
        </Explain>
      )}
      {ex?.piege && (
        <Explain title={ex.piegeQuestion ? `Ça peut surprendre : ${ex.piegeQuestion}` : "Ça peut surprendre"} tone="warn" icon={<AlertTriangle size={16} />}>
          {ex.piege}
        </Explain>
      )}

      {debate && (
        <Card
          id="pourquoi"
          className="scroll-mt-24 !border-accent/40"
          title={
            <>
              <span className="text-xl md:text-2xl font-extrabold">Pourquoi ils ont voté comme ça</span> <Help title="D'où ça vient ?">Avant le vote, chaque groupe peut expliquer son choix en séance. On résume ce passage du compte rendu officiel, sans rien deviner.</Help>
            </>
          }
          subtitle={ex ? `d'après le débat officiel · résumé le ${fmtDate(debate.explainedAt)}${ex.fiabilite !== "bonne" ? ` · ${ex.fiabilite === "partielle" ? "seuls quelques groupes ont expliqué leur vote" : "le débat explique peu ce vote"}` : ""}` : "le résumé en mots simples arrive bientôt · le débat officiel est déjà lisible ci-dessous"}
        >
          {ex && (ex.argumentsPour.length > 0 || ex.argumentsContre.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5 [&>*]:min-w-0">
              {[
                { label: "Les arguments pour", items: ex.argumentsPour, cls: "border-good/30 bg-good/5", dot: "bg-good" },
                { label: "Les arguments contre", items: ex.argumentsContre, cls: "border-bad/30 bg-bad/5", dot: "bg-bad" },
              ].map((col) => (
                <div key={col.label} className={`rounded-2xl border p-4 ${col.cls}`}>
                  <div className="text-sm font-semibold mb-2">{col.label}</div>
                  {col.items.length ? (
                    <ul className="space-y-1.5 text-sm text-ink-2">
                      {col.items.map((a, i) => (
                        <li key={i} className="flex gap-2">
                          <span className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${col.dot}`} />
                          {a}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-3">Personne ne les a donnés pendant le débat.</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {ex && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start [&>*]:min-w-0">
              {votingGroups
                .filter((g) => explainedRef.has(g.groupRef))
                .map((g) => {
                  const e = ex.groupes.find((x) => x.groupRef === g.groupRef);
                  const name = g.party_name ?? g.group_name ?? g.groupAbbrev ?? g.groupRef;
                  return (
                    <div key={g.groupRef} className="rounded-2xl border border-border bg-surface-2/50 p-4 text-sm">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="flex items-center gap-2 font-semibold min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color ?? "var(--neutral)" }} />
                          <span className="truncate">{name}</span>
                        </span>
                        <Position p={g.position} badge />
                      </div>
                      {e?.raison && <p className="text-ink-2 leading-relaxed">{e.raison}</p>}
                      {e?.citation && (
                        <blockquote className="mt-2 border-l-2 border-accent/50 pl-3 text-ink-2 italic">
                          « {e.citation} »
                          {e.orateur && (
                            <footer className="not-italic text-xs text-ink-3 mt-1">
                              —{" "}
                              {e.politicianId ? (
                                <Link href={`/parlementaires/${e.politicianId}`} className="underline">
                                  {e.orateur}
                                </Link>
                              ) : (
                                e.orateur
                              )}
                            </footer>
                          )}
                        </blockquote>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
          {ex && silent.length > 0 && (
            <p className="text-sm text-ink-3 mt-4 leading-relaxed">
              <span className="font-semibold text-ink-2">N&apos;ont pas pris la parole pour expliquer leur vote : </span>
              {silent.map((g, i) => (
                <Fragment key={g.groupRef}>
                  {i > 0 && ", "}
                  <span className="whitespace-nowrap">
                    {g.party_name ?? g.group_name ?? g.groupAbbrev ?? g.groupRef} <Position p={g.position} />
                  </span>
                </Fragment>
              ))}
              .
            </p>
          )}
          <details className="mt-5 group">
            <summary className="cursor-pointer text-sm font-semibold text-accent-ink">Lire le débat officiel ({debate.turns.filter((t) => t.role !== "presidence").length} prises de parole)</summary>
            <ol className="mt-3 space-y-3">
              {debate.turns.map((t, i) => (
                <li key={i} className={`text-sm ${t.role === "presidence" ? "text-ink-3 italic" : ""}`}>
                  {t.role !== "presidence" && (
                    <div className="text-xs text-ink-3 mb-0.5">
                      {t.politicianId ? (
                        <Link href={`/parlementaires/${t.politicianId}`} className="font-semibold text-ink hover:underline">
                          {t.speaker}
                        </Link>
                      ) : (
                        <span className="font-semibold text-ink">{t.speaker}</span>
                      )}
                      {t.group && ` · ${t.group}`}
                      {t.role === "gouvernement" && " · gouvernement"}
                      {t.quality && t.role !== "parlementaire" && t.role !== "gouvernement" && ` · ${t.quality}`}
                    </div>
                  )}
                  <p className={`whitespace-pre-wrap leading-relaxed ${t.role === "amendement" ? "rounded-xl bg-surface-2 p-3 font-mono text-xs" : ""}`}>{t.text}</p>
                </li>
              ))}
            </ol>
            {debate.url && (
              <p className="text-xs text-ink-3 mt-3">
                Ce passage est recopié tel quel du compte rendu officiel.{" "}
                <OfficialLink href={debate.url} an={scrutin.chamber === "AN"} copied className="inline-flex items-center gap-1 underline">
                  Voir l&apos;original <ExternalLink size={11} />
                </OfficialLink>
                {scrutin.chamber === "AN" && <span className="block mt-0.5">{OFFICIAL_SITE_HINT}</span>}
              </p>
            )}
          </details>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 [&>*]:min-w-0">
        <Card title="Le résultat" subtitle={`${scrutin.votants ?? pour + contre + abst} élus ont voté`}>
          <Donut
            data={[
              { name: "Pour", value: pour, color: "var(--good)" },
              { name: "Contre", value: contre, color: "var(--bad)" },
              { name: "Abstention", value: abst, color: "var(--warn)", hint: "présents, mais ni pour ni contre" },
            ]}
            centerLabel={adopted ? "adopté" : "rejeté"}
            centerValue={`${pour} – ${contre}`}
            unit="voix"
            height={210}
          />
        </Card>
        <Card className="lg:col-span-2" title="De quoi parle ce vote ?" subtitle={analysis ? `lu et classé le ${fmtDate(analysis.analyzedAt)}` : undefined}>
          {analysis ? (
            <>
              <ul className="space-y-2 mb-4">
                {analysis.themes.map((t) => {
                  const pl = themePlain(t.theme);
                  const target = t.direction === 1 ? pl.right : t.direction === -1 ? pl.left : null;
                  return (
                    <li key={t.theme} className="flex flex-wrap items-center gap-2 text-sm rounded-2xl bg-surface-2 p-3">
                      <ThemeChip id={t.theme} />
                      <span className="text-ink-2">
                        {target ? (
                          <>
                            voter <strong>pour</strong>, c&apos;est aller vers <strong className={t.direction === 1 ? "text-right" : "text-left"}>« {target} »</strong>
                          </>
                        ) : (
                          <>ce vote ne penche d&apos;aucun côté sur ce sujet</>
                        )}
                        {analysis.themes.length > 1 && <span className="text-ink-3"> · part de ce sujet dans le vote : {Math.round(t.weight * 100)} %</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-sm text-ink-2 leading-relaxed">
                <span className="font-semibold text-ink">Titre officiel : </span>
                {scrutin.title}
                {scrutin.objet && scrutin.objet !== scrutin.title ? ` — ${scrutin.objet}` : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-3">Ce vote n&apos;a pas encore été lu et classé.</p>
          )}
        </Card>
      </div>

      <Card
        title={
          <>
            Qui a voté quoi, groupe par groupe <Help k="groupe" />
          </>
        }
        subtitle="une barre par groupe : vert = pour, rouge = contre, orange = abstention · cliquez sur un parti pour voir sa fiche"
      >
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] gap-8">
          <VoteStacks rows={stacks} />
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Groupe</th>
                  <th>Choix du groupe</th>
                  <th className="!text-right">Pour</th>
                  <th className="!text-right">Contre</th>
                  <th className="!text-right">Abstention</th>
                  <th className="!text-right">
                    <Help k="non-votant" label="Non votants" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.groupRef}>
                    <td>
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: g.color ?? "var(--neutral)" }} />
                      {g.partyId ? (
                        <Link href={`/partis/${g.partyId}`} className="hover:underline font-medium">
                          {g.party_name ?? g.group_name ?? g.groupAbbrev}
                        </Link>
                      ) : (
                        g.group_name ?? g.groupAbbrev ?? g.groupRef
                      )}
                    </td>
                    <td>
                      <Position p={g.position} badge />
                    </td>
                    <td className="!text-right num">{g.pour}</td>
                    <td className="!text-right num">{g.contre}</td>
                    <td className="!text-right num">{g.abstentions}</td>
                    <td className="!text-right num text-ink-3">{g.nonVotants}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <Card
        id="calcul"
        className="scroll-mt-24"
        title={
          <>
            Le calcul : ce que ce vote compte pour chaque parti <Help title="La règle">Mêmes règles pour tous les partis et tous les votes. Détail sur la page « Comment ça marche ? ».</Help>
          </>
        }
        subtitle={`${KIND_LABEL[kind]}${analysis ? ` · importance ${analysis.salience} sur 5` : ""} · compte dans la position ${scrutin.chamber === "SENAT" ? "au Sénat" : "à l'Assemblée"}`}
      >
        {!analysis ? (
          <p className="text-sm text-ink-3">Ce vote n&apos;a pas encore été lu et classé : il ne compte encore dans aucun calcul.</p>
        ) : analysis.isProcedural ? (
          <p className="text-sm text-ink-2">Vote de procédure : il porte sur la façon de débattre, pas sur le contenu. Il ne compte dans aucune position.</p>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-ink-2 leading-relaxed">
              Pour chaque groupe : sa position est le choix le plus fréquent de ses élus qui ont voté (égalité ou personne : il ne compte pas). Elle donne des points (pour +1,
              contre −1, abstention 0), multipliés par le sens du « pour » sur le sujet, puis par le poids du vote. La position d&apos;un parti sur un sujet est la somme de ces
              contributions divisée par la somme des poids, sur tous ses votes.
            </p>
            {analysis.themes.map((t) => {
              const pl = themePlain(t.theme);
              if (!t.direction)
                return (
                  <p key={t.theme} className="text-sm text-ink-3">
                    <ThemeChip id={t.theme} /> ce vote ne penche d&apos;aucun côté sur ce sujet : il n&apos;y compte pas.
                  </p>
                );
              const w = t.weight * analysis.salience;
              return (
                <div key={t.theme}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <ThemeChip id={t.theme} />
                    <span className="text-ink-2">
                      voter pour = aller vers <strong className={t.direction === 1 ? "text-right" : "text-left"}>« {t.direction === 1 ? pl.right : pl.left} »</strong> (sens{" "}
                      {signed(t.direction, 0)}) · poids = part du sujet {dec(t.weight)} × importance {analysis.salience} = <strong className="text-ink num">{dec(w)}</strong>
                    </span>
                  </div>
                  <div className="overflow-x-auto mt-2">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Parti</th>
                          <th>Décompte → position du groupe</th>
                          <th>Calcul</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups
                          .filter((g) => g.partyId)
                          .map((g) => (
                            <tr key={g.groupRef}>
                              <td>
                                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: g.color ?? "var(--neutral)" }} />
                                <Link href={scrutin.chamber === "SENAT" ? `/partis/${g.partyId}#${t.theme}` : `/ecarts/${g.partyId}/${t.theme}`} className="hover:underline font-medium">
                                  {g.party_name ?? g.groupAbbrev}
                                </Link>
                              </td>
                              <td className="text-xs text-ink-2">
                                <GroupRule pour={g.pour} contre={g.contre} abstentions={g.abstentions} />
                              </td>
                              <td className="text-xs text-ink-2">
                                {g.position ? <VoteCalc themeId={t.theme} position={g.position} direction={t.direction} weight={t.weight} salience={analysis.salience} /> : "—"}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-ink-3">
              Les groupes sans parti suivi (non-inscrits, groupes mixtes) ne comptent pour aucun parti. Cliquez sur un parti pour voir tous les votes qui font sa position.
            </p>
          </div>
        )}
      </Card>

      <Card title="Le vote de chaque élu" subtitle={`${votes.length} élus · ⁺ = vote confié à un collègue (délégation)`}>
        <div className="grid md:grid-cols-3 gap-5 text-xs">
          {(["pour", "contre", "abstention"] as const).map((pos) => (
            <div key={pos}>
              <h3 className="mb-2 flex items-center gap-2">
                <Position p={pos} badge /> <span className="text-ink-3 num">{byPos(pos).length}</span>
              </h3>
              <div className="flex flex-wrap gap-1 max-h-80 overflow-y-auto pr-1">
                {byPos(pos).map((v) => (
                  <Link key={v.id} href={`/parlementaires/${v.id}`} className="pill !py-0.5 !font-medium" title={`${v.group_abbrev ?? ""} ${v.department ?? ""}`}>
                    {v.full_name}
                    {v.par_delegation ? " ⁺" : ""}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-3 mt-3">Les élus qui ont quitté leur siège depuis ce vote ne sont pas listés ici.</p>
      </Card>
    </div>
  );
}
