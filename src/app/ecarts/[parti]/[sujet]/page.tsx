import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { ecartProofs, stancesOf } from "@/lib/queries-ecarts";
import { THEME_BY_ID } from "@/lib/config/themes";
import { ECART_CAVEAT, POST_KIND_PLAIN, SOURCE_LABEL, ecartSentence, stanceWords, themePlain, type AlignSource } from "@/lib/config/plain";
import { DISCOURS_MIN_POSTS, DISCOURS_MIN_SPEAKERS, PROGRAMME_MIN_CONFIDENCE, VOTES_MIN_N } from "@/lib/config/thresholds";
import { AlignmentLegend, AlignmentRow, Marker, missingText } from "@/components/alignment";
import { Empty, OfficialLink, PageHeader, Position, Salience, fmtDate, fmtInt } from "@/components/ui";
import { ShareButton } from "@/components/share-button";
import { shareImage } from "@/lib/share/paths";
import { ecartMetadata } from "@/lib/share/meta";
import { GroupRule, KIND_LABEL, VoteCalc } from "@/components/calc";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/ecarts/[parti]/[sujet]">) {
  const { parti, sujet } = await props.params;
  return ecartMetadata(parti, sujet);
}

const num = (v: number, d = 2) => `${v > 0 ? "+" : ""}${v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const dec = (v: number, d = 1) =>
  v.toLocaleString("fr-FR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
const VOTES_SHOWN = 15;
const VOTES_MAX = 300;
const POSTS_SHOWN = 12;

export default async function EcartPage(props: PageProps<"/ecarts/[parti]/[sujet]">) {
  const { parti, sujet } = await props.params;
  const d = ecartProofs(parti, sujet);
  const theme = THEME_BY_ID[sujet];
  if (!d || !theme) notFound();
  const { party, alignment: a, programme, votes, discours, sums } = d;
  const pl = themePlain(sujet);
  const words = (v: number | null) => (v === null ? "" : (stanceWords(sujet, v)?.text ?? ""));
  const sideLabel = (v: number) =>
    v < 0 ? <span className="text-left font-semibold">← {pl.left}</span> : v > 0 ? <span className="text-right font-semibold">{pl.right} →</span> : <span className="text-ink-3">compte pour 0</span>;

  const okCount = [a.programme.ok, a.votes.ok, a.discours.ok].filter(Boolean).length;
  const status = a.alert
    ? null
    : okCount < 2
      ? "Pas encore assez d'éléments pour comparer : il faut au moins deux repères fiables."
      : `Pas d'écart signalé : les repères fiables restent proches (écart de ${dec(a.spread ?? 0, 2)} sur 2).`;

  const head = (src: AlignSource, sub: string) => (
    <div className="flex items-start gap-2 mb-3">
      <Marker src={src} size={26} />
      <div className="min-w-0">
        <h2 className="text-lg font-bold leading-tight">{SOURCE_LABEL[src]}</h2>
        <p className="text-xs text-ink-3">{sub}</p>
      </div>
    </div>
  );
  const verdictLine = (src: AlignSource) => {
    const st = a[src];
    return st.ok ? <p className="font-semibold">{words(st.stance)}</p> : <p className="font-semibold text-ink-3 italic">Pas affiché : {missingText(src, a)}.</p>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <Link href="/ecarts" className="hover:underline">
              Les écarts
            </Link>{" "}
            · {theme.emoji} {theme.label}
          </>
        }
        title={
          <span className="inline-flex items-center gap-3">
            <span className="w-4 h-4 rounded-full shrink-0" style={{ background: party.color }} />
            <span>
              {party.name} : {theme.label.toLowerCase()}
            </span>
          </span>
        }
        description={pl.question}
        actions={
          <ShareButton
            image={shareImage.ecart(party.id, sujet)}
            title={`${party.shortName}, ${theme.label} : ce qu'il écrit, ce qu'il vote, ce qu'il dit`}
            filename={`coherence-ecart-${party.id}-${sujet}`}
          />
        }
      />

      <AlignmentRow a={a} themeId={sujet} partyId={party.id} partyShort={party.shortName} showScale hideLink className="bg-surface !p-4 md:!p-5" />
      {status && <p className="text-sm text-ink-2">{status}</p>}
      <p className="text-xs text-ink-3">{ECART_CAVEAT}</p>
      <AlignmentLegend compact />

      <div className="grid lg:grid-cols-3 gap-4 [&>*]:min-w-0 items-start">
        {/* ---- Programme ---- */}
        <section className="card p-4 md:p-5">
          {head("programme", "ce que le parti écrit dans ses programmes")}
          {verdictLine("programme")}
          <p className="text-xs text-ink-3 mt-1">
            Calcul : moyenne des positions lues dans chaque document, pondérée par la clarté de la lecture
            {sums.programme.den > 0 && <> = {num(sums.programme.num / sums.programme.den)}</>}. Affiché si la clarté cumulée atteint {dec(PROGRAMME_MIN_CONFIDENCE)} (ici {dec(sums.programme.den, 2)}).
          </p>
          {programme.length === 0 ? (
            <div className="mt-3">
              <Empty>Aucun document de programme lu ne parle de ce sujet.</Empty>
            </div>
          ) : (
            <ul className="mt-4 space-y-4">
              {programme.map((p) => (
                <li key={p.documentId} className="border-l-2 border-ink/30 pl-3">
                  <Link href={`/programmes/${p.documentId}`} className="font-semibold hover:underline break-words">
                    {p.title}
                  </Link>
                  <div className="text-xs text-ink-3 mt-0.5">
                    {words(p.stance)} · lecture claire à {Math.round(p.confidence * 100)} %
                    {p.url && (
                      <>
                        {" · "}
                        <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:underline">
                          document d&apos;origine <ExternalLink size={11} />
                        </a>
                      </>
                    )}
                  </div>
                  {p.quotes.map((q, i) => (
                    <blockquote key={i} className="mt-2 text-sm italic text-ink-2">
                      « {q} »
                    </blockquote>
                  ))}
                  {p.quotes.length === 0 && <p className="mt-2 text-sm text-ink-2">{p.summary}</p>}
                  {p.measures.length > 0 && (
                    <details className="mt-1.5 text-sm">
                      <summary className="cursor-pointer text-xs font-semibold text-accent-ink hover:underline">Les mesures ({p.measures.length})</summary>
                      <ul className="list-disc pl-5 mt-1 text-ink-2 space-y-0.5">
                        {p.measures.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- Votes ---- */}
        <section id="votes" className="card p-4 md:p-5 scroll-mt-20">
          {head("votes", "ce que vote la majorité de ses députés")}
          {verdictLine("votes")}
          <p className="text-xs text-ink-3 mt-1">
            Calcul : chaque vote compte vers un côté ou l&apos;autre, selon le sens du texte et la position du groupe ; les votes importants pèsent plus
            {sums.votes.den > 0 && (
              <>
                {" "}
                : {dec(sums.votes.num)} ÷ {dec(sums.votes.den)} = {num(sums.votes.num / sums.votes.den)}
              </>
            )}
            . Affiché à partir de {VOTES_MIN_N} votes (ici {fmtInt(votes.length)}). Le détail de chaque vote est écrit sous son titre.
          </p>
          {(a.split.detail.n > 0 || a.split.global.n > 0) && (
            <div className={`mt-3 rounded-xl p-3 text-xs leading-relaxed ${a.split.diverge ? "border border-warn/40 bg-surface-2" : "bg-surface-2"}`}>
              <div className="font-semibold text-ink mb-1">
                {a.split.diverge ? "⚠️ " : ""}Contrôle des votes tactiques{" "}
                <Link href="/comprendre#votes-tactiques" className="font-normal text-accent-ink hover:underline">
                  (c&apos;est quoi ?)
                </Link>
              </div>
              <div>
                Article par article : {a.split.detail.stance !== null ? `${num(a.split.detail.stance)}, ${words(a.split.detail.stance)}` : "—"} ({fmtInt(a.split.detail.n)} votes)
              </div>
              <div>
                Textes entiers et motions : {a.split.global.stance !== null ? `${num(a.split.global.stance)}, ${words(a.split.global.stance)}` : "—"} ({fmtInt(a.split.global.n)} votes)
              </div>
              <div className="text-ink-3 mt-1">
                {a.split.diverge
                  ? "Les deux penchent de côtés opposés : vote d'opposition ou tactique, compromis voté par presque tous, ou texte qui mêle des mesures dans les deux sens. Aucun vote n'est retiré du calcul."
                  : a.split.detail.ok && a.split.global.ok
                    ? "Les deux vont dans le même sens : les votes sur les textes entiers ne changent pas le résultat."
                    : "Pas assez de votes d'un des deux types pour comparer."}
              </div>
            </div>
          )}
          {votes.length === 0 ? (
            <div className="mt-3">
              <Empty>Aucun vote de ce parti n&apos;est classé sur ce sujet.</Empty>
            </div>
          ) : (
            <>
              <p className="text-xs text-ink-2 mt-3">
                {fmtInt(votes.filter((v) => v.effect < 0).length)} votes vers « {pl.left} », {fmtInt(votes.filter((v) => v.effect > 0).length)} vers « {pl.right} »,{" "}
                {fmtInt(votes.filter((v) => v.effect === 0).length)} abstentions. Les plus importants :
              </p>
              <VoteList items={votes.slice(0, VOTES_SHOWN)} sideLabel={sideLabel} themeId={sujet} />
              {votes.length > VOTES_SHOWN && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-accent-ink hover:underline">Voir les {fmtInt(Math.min(votes.length, VOTES_MAX) - VOTES_SHOWN)} autres votes</summary>
                  <VoteList items={votes.slice(VOTES_SHOWN, VOTES_MAX)} sideLabel={sideLabel} themeId={sujet} />
                  {votes.length > VOTES_MAX && (
                    <p className="text-xs text-ink-3 mt-2">
                      Et {fmtInt(votes.length - VOTES_MAX)} votes de moindre poids :{" "}
                      <Link href={`/scrutins?party=${party.id}&theme=${sujet}`} className="text-accent-ink hover:underline">
                        liste complète
                      </Link>
                      .
                    </p>
                  )}
                </details>
              )}
            </>
          )}
        </section>

        {/* ---- Discours ---- */}
        <section className="card p-4 md:p-5">
          {head("discours", "ce que disent ses élus en séance et dans ses communiqués")}
          {verdictLine("discours")}
          <p className="text-xs text-ink-3 mt-1">
            Calcul : moyenne des positions de chaque prise de parole sur ce sujet
            {sums.discours.den > 0 && (
              <>
                {" "}
                : {dec(sums.discours.num, 2)} ÷ {sums.discours.den} = {num(sums.discours.num / sums.discours.den)}
              </>
            )}
            . Affiché à partir de {DISCOURS_MIN_POSTS} prises de parole d&apos;au moins {DISCOURS_MIN_SPEAKERS} élus différents (ici {discours.length}, {a.discours.speakers} élu
            {a.discours.speakers > 1 ? "s" : ""}).
          </p>
          {discours.length === 0 ? (
            <div className="mt-3">
              <Empty>Aucune prise de parole analysée sur ce sujet pour l&apos;instant. L&apos;analyse est en cours.</Empty>
            </div>
          ) : (
            <>
              <p className="text-xs text-ink-2 mt-3">
                {discours.filter((p) => p.stance < -0.1).length} vers « {pl.left} », {discours.filter((p) => Math.abs(p.stance) <= 0.1).length} au milieu,{" "}
                {discours.filter((p) => p.stance > 0.1).length} vers « {pl.right} ».
              </p>
              <PostList items={discours.slice(0, POSTS_SHOWN)} words={words} />
              {discours.length > POSTS_SHOWN && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-accent-ink hover:underline">Voir les {discours.length - POSTS_SHOWN} autres prises de parole</summary>
                  <PostList items={discours.slice(POSTS_SHOWN)} words={words} />
                </details>
              )}
            </>
          )}
        </section>
      </div>
      <p className="text-xs text-ink-3">
        En une phrase : {a.alert ? ecartSentence(sujet, party.shortName, stancesOf(a)) : (status ?? "")} Les positions sont recalculées à chaque visite à partir des éléments listés ci-dessus.
      </p>
    </div>
  );
}

type Proofs = NonNullable<ReturnType<typeof ecartProofs>>;

function VoteList({ items, sideLabel, themeId }: { items: Proofs["votes"]; sideLabel: (v: number) => ReactNode; themeId: string }) {
  return (
    <ul className="mt-2 space-y-3 text-sm">
      {items.map((v) => (
        <li key={`${v.uid}`} className="border-b border-border pb-2.5 last:border-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
            <span>{fmtDate(v.date)}</span>
            <Position p={v.position} badge />
            <Salience s={v.salience} />
          </div>
          <Link href={`/scrutins/${v.uid}`} className="block mt-1 hover:underline font-medium leading-snug">
            {v.summary ?? v.title}
          </Link>
          <div className="text-xs mt-0.5">
            <span className="text-ink-3">Ce vote compte vers : </span>
            {sideLabel(v.effect)}
          </div>
          <details className="text-xs mt-1 text-ink-2">
            <summary className="cursor-pointer text-accent-ink hover:underline">Le calcul</summary>
            <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-border">
              <div>{KIND_LABEL[v.kind]}</div>
              <div>
                Groupe : <GroupRule pour={v.pour} contre={v.contre} abstentions={v.abstentions} />
              </div>
              <div>
                <VoteCalc themeId={themeId} position={v.position} direction={v.direction} weight={v.themeWeight} salience={v.salience} />
              </div>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

function PostList({ items, words }: { items: Proofs["discours"]; words: (v: number) => string }) {
  return (
    <ul className="mt-2 space-y-4 text-sm">
      {items.map((p) => (
        <li key={p.id} className="border-l-2 border-accent/50 pl-3">
          <div className="text-xs text-ink-3 flex flex-wrap gap-x-2 gap-y-0.5 items-center">
            {p.politicianId ? (
              <Link href={`/parlementaires/${p.politicianId}`} className="font-semibold text-ink-2 hover:underline">
                {p.speaker}
              </Link>
            ) : (
              <span className="font-semibold text-ink-2">{p.speaker}</span>
            )}
            <span>{POST_KIND_PLAIN[p.kind] ?? p.kind}</span>
            <span>
              {fmtDate(p.date)}
              {p.chamber ? ` · ${p.chamber === "SENAT" ? "Sénat" : "Assemblée"}` : ""}
            </span>
          </div>
          {p.title && <div className="text-xs font-medium text-ink-2 mt-0.5">{p.title}</div>}
          {p.text.length > 420 ? (
            <details className="mt-1">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden text-ink-2 leading-relaxed">
                « {p.text.slice(0, 400).replace(/\s+\S*$/, "")}… » <span className="text-accent-ink font-semibold text-xs">lire tout</span>
              </summary>
              <p className="text-ink-2 leading-relaxed whitespace-pre-line">« {p.text} »</p>
            </details>
          ) : (
            <p className="mt-1 text-ink-2 leading-relaxed">« {p.text} »</p>
          )}
          <div className="text-xs mt-1 flex flex-wrap gap-x-3">
            <span className="text-accent-ink font-semibold">{words(p.stance)}</span>
            {p.url && (
              <OfficialLink href={p.url} an={p.chamber === "AN"} className="inline-flex items-center gap-0.5 text-ink-3 hover:underline">
                source officielle <ExternalLink size={11} />
              </OfficialLink>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
