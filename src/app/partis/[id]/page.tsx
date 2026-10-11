import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { partyDetail } from "@/lib/queries";
import { Card, SectionTitle, Verdict, Position, fmtDate, Empty } from "@/components/ui";
import { AlignmentLegend, AlignmentRow, missingText } from "@/components/alignment";
import { allAlignments } from "@/lib/queries-ecarts";
import { THEMES } from "@/lib/config/themes";
import { HandlesEditor } from "@/components/handles-editor";
import { Help } from "@/components/help";
import { isAdmin } from "@/lib/auth";
import { memberParticipation } from "@/lib/analysis/participation";
import { VERDICT_PLAIN, gapWords, stanceWords, themePlain, POST_KIND_PLAIN as KIND_LABEL } from "@/lib/config/plain";
import { ShareButton } from "@/components/share-button";
import { shareImage } from "@/lib/share/paths";
import { partyMetadata } from "@/lib/share/meta";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/partis/[id]">) {
  return partyMetadata((await props.params).id);
}

const TONE_TEXT: Record<string, string> = { good: "text-good", warn: "text-warn", bad: "text-bad", muted: "text-ink-3" };

export default async function PartyPage(props: PageProps<"/partis/[id]">) {
  const { id } = await props.params;
  const d = partyDetail(id);
  if (!d) notFound();
  const admin = await isAdmin();
  const { party, scores, docs, docAnalyses, members, recentVotes, posts, claims, docSummaries } = d;
  const deputes = members.filter((m) => m.chamber === "AN");
  const senateurs = members.filter((m) => m.chamber === "SENAT");
  const gaps = scores.map((s) => s.gap).filter((g): g is number => g !== null);
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  const gw = gapWords(avgGap);
  const presence = memberParticipation("AN", { minEligible: 20 }).filter((m) => m.partyId === party.id && !m.presidency);
  const presenceRate = presence.length ? presence.reduce((a, m) => a + m.present, 0) / Math.max(1, presence.reduce((a, m) => a + m.eligible, 0)) : null;
  const themesWithVotes = scores.filter((s) => s.votedN > 0).length;
  const analyzedDocs = docs.filter((x) => x.status === "analyzed");
  const align = allAlignments();

  return (
    <div className="space-y-8">
      {/* ---- En-tête ---- */}
      <section className="card overflow-hidden rise">
        <div className="h-2.5" style={{ background: `linear-gradient(90deg, ${party.color}, color-mix(in srgb, ${party.color} 35%, transparent))` }} />
        <div className="p-5 md:p-8">
          <div>
            <div className="eyebrow">{party.family}</div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mt-1 flex items-center gap-3">
              <span className="w-5 h-5 rounded-full shrink-0" style={{ background: party.color }} />
              {party.name}
            </h1>
            <div className="text-ink-2 mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {party.leaders.length > 0 && <span>Dirigé par {party.leaders.join(" et ")}</span>}
              {party.website && (
                <a href={party.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  site officiel <ExternalLink size={12} />
                </a>
              )}
            </div>
            {party.notes && <p className="text-sm text-ink-3 mt-2">{party.notes}</p>}
            <div className="mt-3">
              <ShareButton image={shareImage.parti(party.id)} title={`${party.name} : ses positions sur ${THEMES.length} sujets`} filename={`coherence-${party.id}`} align="left" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              <div className="rounded-2xl bg-surface-2 p-4">
                <div className="text-xs text-ink-3">Élus</div>
                <div className="text-2xl font-extrabold num">
                  {deputes.length} <span className="text-xs font-medium text-ink-3">députés</span>
                </div>
                <div className="text-sm text-ink-2 num">
                  {senateurs.length} <span className="text-xs text-ink-3">sénateurs</span>
                </div>
              </div>
              <div className="rounded-2xl bg-surface-2 p-4">
                <div className="text-xs text-ink-3">
                  Dans l&apos;ensemble <Help k="ecart" />
                </div>
                <div className={`text-xl font-extrabold leading-tight ${TONE_TEXT[gw.tone]}`}>{gw.label}</div>
                <div className="text-xs text-ink-3 mt-1">écart moyen {avgGap === null ? "—" : avgGap.toFixed(2)} sur 2</div>
              </div>
              <div className="rounded-2xl bg-surface-2 p-4">
                <div className="text-xs text-ink-3">Sujets avec des votes</div>
                <div className="text-2xl font-extrabold num">
                  {themesWithVotes} <span className="text-xs font-medium text-ink-3">/ {THEMES.length}</span>
                </div>
                <div className="text-xs text-ink-3 mt-1">{analyzedDocs.length} document{analyzedDocs.length > 1 ? "s" : ""} de programme lu{analyzedDocs.length > 1 ? "s" : ""}</div>
              </div>
              <div className="rounded-2xl bg-surface-2 p-4">
                <div className="text-xs text-ink-3">
                  Présence des députés <Help k="presence" />
                </div>
                <div className="text-2xl font-extrabold num">{presenceRate === null ? "—" : `${Math.round(presenceRate * 100)} %`}</div>
                <div className="text-xs text-ink-3 mt-1">
                  <Link href="/assiduite" className="hover:underline">
                    voir le classement
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle title="Sujet par sujet" />
        <nav aria-label="Aller à un sujet" className="flex flex-wrap gap-2">
          {THEMES.map((t) => {
            const v = scores.find((x) => x.theme === t.id)?.verdict;
            const vp = v ? VERDICT_PLAIN[v] : null;
            return (
              <a key={t.id} href={`#${t.id}`} className="pill !text-sm !py-1.5" title={vp ? `${t.label} : ${vp.label}` : t.label}>
                <span aria-hidden>{t.emoji}</span> {t.label}
                {vp && <span aria-label={vp.label}>{vp.emoji}</span>}
              </a>
            );
          })}
        </nav>
        <AlignmentLegend />
      </section>

      {/* ---- Thèmes ---- */}
      <div className="grid grid-cols-1 gap-4 [&>*]:min-w-0">
        {THEMES.map((t) => {
          const s = scores.find((x) => x.theme === t.id);
          const da = docAnalyses.filter((x) => x.theme === t.id);
          const pl = themePlain(t.id);
          const a = align.get(`${party.id}|${t.id}`);
          const dw = a?.programme.ok ? stanceWords(t.id, a.programme.stance) : null;
          const vw = a?.votes.ok ? stanceWords(t.id, a.votes.stance) : null;
          const sw = a?.discours.ok ? stanceWords(t.id, a.discours.stance) : null;
          return (
            <Card key={t.id} id={t.id} className="scroll-mt-20">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/themes/${t.id}`} className="text-lg md:text-xl font-bold hover:underline">
                    {t.emoji} {t.label}
                  </Link>
                  <p className="text-sm text-ink-2 mt-0.5">{pl.question}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Verdict v={s?.verdict} size="md" />
                  <ShareButton size="sm" image={shareImage.partiSujet(party.id, t.id)} url={`/partis/${party.id}#${t.id}`} title={`${party.name} et le sujet « ${t.label} » : ce qu'il dit, ce qu'il vote`} filename={`coherence-${party.id}-${t.id}`} />
                </div>
              </div>
              {a && <AlignmentRow a={a} themeId={t.id} partyId={party.id} partyShort={party.shortName} showScale className="mt-4" />}
              <dl className="mt-4 text-sm rounded-2xl bg-surface-2 divide-y divide-border sm:divide-y-0 sm:grid sm:grid-cols-3 [&>*]:min-w-0">
                {[
                  { k: "Programme : ce qu'il écrit", v: dw ? dw.text : a ? missingText("programme", a) : "—", n: a?.programme.n ? `${a.programme.n} document${a.programme.n > 1 ? "s" : ""} lu${a.programme.n > 1 ? "s" : ""}` : "" },
                  { k: "Votes : ce qu'il vote", v: vw ? vw.text : a ? missingText("votes", a) : "—", n: `${a?.votes.n ? `${a.votes.n} votes à l'Assemblée` : ""}${s?.senatStance != null && s.senatN ? ` · ${s.senatN} au Sénat` : ""}` },
                  { k: "Discours : ce que disent ses élus", v: sw ? sw.text : a ? missingText("discours", a) : "—", n: a?.discours.n ? `${a.discours.n} prise${a.discours.n > 1 ? "s" : ""} de parole, ${a.discours.speakers} élu${a.discours.speakers > 1 ? "s" : ""}` : "" },
                ].map((row) => (
                  <div key={row.k} className="p-3">
                    <dt className="text-xs text-ink-3">{row.k}</dt>
                    <dd className="font-semibold mt-0.5">{row.v}</dd>
                    {row.n && <dd className="text-xs text-ink-3 mt-0.5">{row.n}</dd>}
                  </div>
                ))}
              </dl>
              {a?.split.diverge && (
                <p className="mt-3 rounded-2xl border border-warn/40 bg-surface-2 p-3 text-sm text-ink-2 leading-relaxed">
                  <strong className="text-ink">⚠️ Ses votes sur les textes entiers ne vont pas dans le même sens que ses votes article par article.</strong>{" "}
                  Article par article, il vote {stanceWords(t.id, a.split.detail.stance!)?.text ?? "—"} ({a.split.detail.n} votes) ; sur les textes entiers et les motions,{" "}
                  {stanceWords(t.id, a.split.global.stance!)?.text ?? "—"} ({a.split.global.n} votes). Causes possibles : vote d&apos;opposition ou tactique, compromis final voté par presque tous, texte qui mêle des mesures dans les deux sens.{" "}
                  <Link href={`/ecarts/${party.id}/${t.id}#votes`} className="text-accent-ink font-semibold hover:underline">
                    Voir le calcul
                  </Link>
                  {" · "}
                  <Link href="/comprendre#votes-tactiques" className="text-accent-ink font-semibold hover:underline">
                    Comment on traite ces votes
                  </Link>
                </p>
              )}
              {s?.narrative ? (
                <details className="group mt-4 rounded-2xl border border-accent/30 bg-accent-soft p-4 text-sm leading-relaxed">
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <span className="font-semibold">L&apos;explication</span>
                    <span className="text-ink-2 mt-1 line-clamp-3 group-open:hidden">{s.narrative}</span>
                    <span className="inline-block mt-1 text-accent-ink font-semibold group-open:hidden">Lire la suite</span>
                  </summary>
                  <p className="text-ink-2 mt-1">{s.narrative}</p>
                </details>
              ) : (
                <p className="text-xs text-ink-3 mt-3">Pas encore d&apos;explication rédigée pour ce sujet.</p>
              )}
              <div className="flex flex-wrap gap-4 mt-3">
                {da.length > 0 && (
                  <details className="text-sm w-full">
                    <summary className="cursor-pointer font-semibold text-accent-ink hover:underline">Ce que dit le programme, mot pour mot ({da.length} source{da.length > 1 ? "s" : ""})</summary>
                    {da.map((x) => (
                      <div key={`${x.documentId}`} className="mt-3 pl-4 border-l-2 border-accent/40">
                        <div className="text-xs text-ink-3">
                          {x.doc_title} · {stanceWords(t.id, x.stance)?.text ?? ""} · lecture sûre à {Math.round(x.confidence * 100)} %
                        </div>
                        <p className="mt-1 text-ink-2">{x.summary}</p>
                        <ul className="list-disc pl-5 mt-1 text-ink-2">
                          {x.measures.map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}
                        </ul>
                        {x.quotes.map((q, i) => (
                          <blockquote key={i} className="text-ink-2 italic mt-1.5">
                            « {q} »
                          </blockquote>
                        ))}
                      </div>
                    ))}
                  </details>
                )}
                {s?.evidence && s.evidence.length > 0 && (
                  <details className="text-sm w-full">
                    <summary className="cursor-pointer font-semibold text-accent-ink hover:underline">Les votes pris en compte ({s.evidence.length})</summary>
                    <ul className="mt-3 space-y-1.5">
                      {s.evidence.slice(0, 12).map((e) => (
                        <li key={e.scrutinUid} className="flex flex-wrap sm:flex-nowrap gap-x-2 gap-y-1 items-start">
                          <span className="text-xs text-ink-3 w-20 shrink-0 pt-0.5">{fmtDate(e.date)}</span>
                          <Position p={e.position} badge />
                          <Link href={`/scrutins/${e.scrutinUid}`} className="hover:underline min-w-0">
                            {e.title}
                          </Link>
                          {e.note && <span className="text-xs text-ink-3">— {e.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* ---- Programmes et votes récents ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 [&>*]:min-w-0">
        <Card
          title={
            <>
              Ses programmes <Help k="programme" />
            </>
          }
        >
          {docs.length === 0 ? (
            <Empty>Aucun document pour l&apos;instant.</Empty>
          ) : (
            <>
              <ul className="space-y-3 text-sm">
                {analyzedDocs.map((doc) => (
                  <li key={doc.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <Link href={`/programmes/${doc.id}`} className="font-semibold hover:underline break-words">
                      {doc.title}
                    </Link>
                    {docSummaries[String(doc.id)] && (
                      <p className="text-ink-2 mt-1 leading-relaxed line-clamp-3">
                        <span className="text-xs text-ink-3">{docSummaries[String(doc.id)].period} — </span>
                        {docSummaries[String(doc.id)].summary}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {docs.length > analyzedDocs.length && (
                <details className="mt-3 text-xs text-ink-3">
                  <summary className="cursor-pointer hover:text-ink">
                    {docs.length - analyzedDocs.length} autre{docs.length - analyzedDocs.length > 1 ? "s" : ""} document{docs.length - analyzedDocs.length > 1 ? "s" : ""} pas encore lu{docs.length - analyzedDocs.length > 1 ? "s" : ""}
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {docs
                      .filter((doc) => doc.status !== "analyzed")
                      .map((doc) => (
                        <li key={doc.id} className="break-words">
                          {doc.url ? (
                            <a href={doc.url} target="_blank" rel="noreferrer" className="hover:underline">
                              {doc.title}
                            </a>
                          ) : (
                            doc.title
                          )}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </Card>

        <Card title="Ses derniers grands votes" subtitle="ce qu'a voté la majorité de ses députés ou sénateurs">
          {recentVotes.length === 0 ? (
            <Empty>Pas encore de vote important pour ce parti.</Empty>
          ) : (
            <ul className="space-y-3 text-sm">
              {recentVotes.slice(0, 8).map((v) => (
                <li key={v.uid} className="flex gap-3 items-start">
                  <span className="shrink-0 pt-0.5">
                    <Position p={v.position} badge />
                  </span>
                  <div className="min-w-0">
                    <Link href={`/scrutins/${v.uid}`} className="hover:underline font-medium">
                      {v.summary ?? v.title}
                    </Link>
                    <div className="text-xs text-ink-3 mt-0.5">
                      {fmtDate(v.date)} · {v.chamber === "SENAT" ? "Sénat" : "Assemblée"}
                      {v.sort ? ` · ${v.sort}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/scrutins?party=${party.id}&major=1`} className="mt-4 inline-block text-sm font-semibold text-accent-ink hover:underline">
            Tous ses votes →
          </Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 [&>*]:min-w-0">
        <Card title="Ce qu'ils affirment, vérifié" subtitle="des phrases de ses élus, comparées à leurs votes">
          {claims.length === 0 ? (
            <Empty>Aucune affirmation vérifiée pour l&apos;instant.</Empty>
          ) : (
            <>
              <ul className="space-y-4 text-sm">
                {claims.slice(0, 4).map((c) => (
                  <ClaimItem key={c.id} c={c} />
                ))}
              </ul>
              {claims.length > 4 && (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer font-semibold text-accent-ink hover:underline">Voir les {claims.length - 4} autres</summary>
                  <ul className="space-y-4 mt-4">
                    {claims.slice(4).map((c) => (
                      <ClaimItem key={c.id} c={c} />
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </Card>
        <Card
          title={
            <>
              Ses prises de parole <Help k="prise-de-parole" />
            </>
          }
          subtitle="ce que ses élus ont dit récemment au Parlement, et ses communiqués"
          action={admin ? <HandlesEditor partyId={party.id} handles={party.xHandles} /> : undefined}
        >
          {posts.length === 0 ? (
            <Empty>Pas encore de prise de parole.</Empty>
          ) : (
            <ul className="space-y-3 text-sm">
              {posts.slice(0, 5).map((p) => (
                <li key={p.id} className="border-b border-border pb-3 last:border-0">
                  <div className="text-xs text-ink-3 flex gap-x-2 gap-y-1 flex-wrap items-center">
                    {p.politicianId ? (
                      <Link href={`/parlementaires/${p.politicianId}`} className="font-semibold text-ink-2 hover:underline">
                        {p.handle}
                      </Link>
                    ) : (
                      <span className="font-semibold text-ink-2">{p.kind === "tweet" ? `@${p.handle}` : p.handle}</span>
                    )}
                    <span className="rounded-full bg-accent-soft text-accent-ink px-2 py-0.5 font-semibold">{KIND_LABEL[p.kind] ?? p.kind}</span>
                    <span>{fmtDate(p.createdAt)}</span>
                  </div>
                  {p.title && <div className="text-xs font-medium text-ink-2 mt-1 line-clamp-1">{p.title}</div>}
                  <p className="mt-1 leading-relaxed text-ink-2 line-clamp-4">{p.text}</p>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/prises-de-parole?parti=${party.id}`} className="mt-3 inline-block text-sm font-semibold text-accent-ink hover:underline">
            Toutes ses prises de parole →
          </Link>
        </Card>
      </div>
    </div>
  );
}

type Claim = NonNullable<ReturnType<typeof partyDetail>>["claims"][number];

function ClaimItem({ c }: { c: Claim }) {
  return (
    <li className="border-b border-border pb-3 last:border-0">
      <div className="flex items-center gap-2 flex-wrap">
        <Verdict v={c.verdict} />
        <span className="text-xs text-ink-3">
          {c.kind === "tweet" ? `@${c.handle}` : c.handle} · {fmtDate(c.created_at)}
        </span>
      </div>
      <p className="mt-1.5 font-semibold">« {c.claim} »</p>
      <p className="text-ink-2 mt-1 leading-relaxed">{c.explanation}</p>
      {c.evidence.slice(0, 2).map((e) => (
        <Link key={e.scrutinUid} href={`/scrutins/${e.scrutinUid}`} className="block text-xs text-ink-3 hover:underline truncate mt-0.5">
          ↳ {e.title}
        </Link>
      ))}
    </li>
  );
}
