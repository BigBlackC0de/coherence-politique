import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, ExternalLink, Quote, Search, Flag } from "lucide-react";
import { Card, Empty, fmtDate } from "@/components/ui";
import { Explain, Help } from "@/components/help";
import { CandidatePortrait, CandidateStatusBadge, SourceRefs, statusWords, fmtSourceDate } from "@/components/candidate-ui";
import { candidateDetail, ageFrom, initials } from "@/lib/queries-candidates";
import type { CandidateFact } from "@/lib/db/schema";
import { JusticeSection } from "@/components/candidate-justice";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/candidats/[id]">) {
  const d = candidateDetail((await props.params).id);
  if (!d) return { title: "Candidat introuvable" };
  return { title: `${d.candidate.fullName} — présidentielle 2027`, description: d.candidate.tagline ?? `Fiche factuelle et sourcée de ${d.candidate.fullName}.` };
}

function contactHref(name: string): string {
  const c = process.env.COHERENCE_CONTACT?.trim();
  const subject = encodeURIComponent(`Erreur sur la fiche de ${name}`);
  if (c && c.includes("@") && !c.startsWith("http")) return `mailto:${c}?subject=${subject}`;
  if (c && /^https?:\/\//.test(c)) return c;
  return "/sources";
}

function FactList({ facts, empty }: { facts: CandidateFact[]; empty: string }) {
  if (!facts.length) return <p className="text-sm text-ink-3 italic">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {facts.map((f, i) => (
        <li key={i} className="text-[15px] leading-relaxed flex gap-2">
          <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-border-2 shrink-0" aria-hidden />
          <span>
            {f.text}
            <SourceRefs sources={f.sources} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({ id, emoji, title, help, children }: { id: string; emoji: string; title: string; help?: ReactNode; children: ReactNode }) {
  return (
    <Card
      id={id}
      title={
        <span className="inline-flex items-center gap-2">
          <span aria-hidden>{emoji}</span> {title}
          {help}
        </span>
      }
    >
      {children}
    </Card>
  );
}

export default async function CandidatPage(props: PageProps<"/candidats/[id]">) {
  const { id } = await props.params;
  const d = candidateDetail(id);
  if (!d) notFound();
  const { candidate: c, party, programme } = d;
  const p = c.profile;
  const color = party?.color ?? "#8a909a";
  const age = ageFrom(c.birthDate);
  const nav = [
    ["identite", "Identité"],
    ["origines", "Origines"],
    ["etudes", "Études"],
    ["carriere", "Métier"],
    ["politique", "Politique"],
    ["mandats", "Mandats"],
    ["patrimoine", "Patrimoine"],
    ["justice", "Justice"],
    ["positions", "Positions"],
    ...(p?.self_vs_sources.length ? [["recit", "Son récit / les sources"]] : []),
  ];

  return (
    <div className="space-y-6 md:space-y-8">
      <Link href="/candidats" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={14} /> Tous les candidats
      </Link>

      {/* ---- En-tête « fiche de personnage » ---- */}
      <section className="card overflow-hidden rise">
        <div className="h-2.5" style={{ background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 35%, transparent))` }} />
        <div className="p-4 md:p-8 grid sm:grid-cols-[180px_1fr] md:grid-cols-[220px_1fr] gap-5 md:gap-8 items-start">
          <figure className="mx-auto sm:mx-0 w-40 sm:w-full">
            <CandidatePortrait photo={c.photo} initials={initials(c)} color={color} name={c.fullName} className="aspect-[4/5] w-full rounded-2xl" textSize="text-6xl" />
            <figcaption className="text-[10.5px] text-ink-3 mt-1.5 leading-snug">
              {c.photo ? (
                <>
                  Photo : {c.photo.author.slice(0, 80)} —{" "}
                  {c.photo.licenseUrl ? (
                    <a href={c.photo.licenseUrl} target="_blank" rel="noreferrer" className="underline">
                      {c.photo.license}
                    </a>
                  ) : (
                    c.photo.license
                  )}
                  ,{" "}
                  <a href={c.photo.sourcePage} target="_blank" rel="noreferrer" className="underline">
                    Wikimedia Commons
                  </a>
                </>
              ) : (
                "Pas de photo sous licence libre disponible."
              )}
            </figcaption>
          </figure>
          <div className="min-w-0">
            <div className="eyebrow">Présidentielle 2027 · {statusWords(c.status)}</div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mt-1">{c.fullName}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {party ? (
                <Link href={`/partis/${party.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface hover:bg-surface-2 px-3 py-1 text-sm">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: party.color }} />
                  <span className="font-medium">{party.name}</span>
                </Link>
              ) : (
                <span className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-sm">{c.partyLabel ?? "Sans étiquette"}</span>
              )}
              <CandidateStatusBadge status={c.status} />
            </div>
            {c.tagline && <p className="text-ink-2 mt-3 text-[15px] leading-relaxed">{c.tagline}</p>}
            <dl className="grid grid-cols-2 gap-3 mt-5">
              <div className="rounded-2xl bg-surface-2 p-3">
                <dt className="text-xs text-ink-3">Âge</dt>
                <dd className="text-xl font-extrabold num">{age !== null ? `${age} ans` : "—"}</dd>
                {c.birthDate && <dd className="text-[11px] text-ink-3">né(e) le {fmtDate(c.birthDate)}</dd>}
              </div>
              <div className="rounded-2xl bg-surface-2 p-3 min-w-0">
                <dt className="text-xs text-ink-3">Lieu de naissance</dt>
                <dd className="text-sm font-semibold leading-snug mt-1">{c.birthPlace ?? "—"}</dd>
              </div>
            </dl>
            {c.statusSource && (
              <p className="text-xs text-ink-3 mt-3">
                {c.status === "officiel" ? "Liste officielle" : c.status === "declare" ? `Candidature annoncée${c.declaredAt ? ` le ${fmtDate(c.declaredAt)}` : ""}` : c.status === "retire" ? "Renoncement" : "Candidature évoquée"} d&apos;après{" "}
                <a href={c.statusSource.url} target="_blank" rel="noreferrer" className="underline hover:text-ink">
                  {c.statusSource.publisher}
                  {c.statusSource.date ? `, ${fmtSourceDate(c.statusSource.date)}` : ""}
                </a>
                .
              </p>
            )}
          </div>
        </div>
      </section>

      {!p ? (
        <Empty>La fiche détaillée de {c.fullName} n&apos;a pas encore été rédigée.</Empty>
      ) : (
        <>
          {/* Sommaire : défilement horizontal sur téléphone */}
          <nav aria-label="Rubriques de la fiche" className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto scroll-fade">
            <div className="flex gap-2 w-max">
              {nav.map(([href, label]) => (
                <a key={href} href={`#${href}`} className="pill whitespace-nowrap">
                  {label}
                </a>
              ))}
            </div>
          </nav>

          {p.summary.text && (
            <Explain title="En bref">
              {p.summary.text}
              <SourceRefs sources={p.summary.sources} />
            </Explain>
          )}

          <div className="grid lg:grid-cols-2 gap-4 md:gap-6">
            <Section id="identite" emoji="🪪" title="Identité">
              <FactList facts={p.identity} empty="Aucun fait sourcé retenu." />
            </Section>
            <Section id="origines" emoji="🏡" title="Famille et origines sociales" help={<Help title="D'où viennent ces informations ?">Uniquement de sources indépendantes (presse, enquêtes, biographies non autorisées). Ce que la personne raconte elle-même de son enfance n&apos;est pas utilisé ici : voir la rubrique « Son récit / ce que montrent les sources ».</Help>}>
              <FactList facts={p.family} empty="Les sources indépendantes consultées ne documentent pas ce point." />
            </Section>
            <Section id="etudes" emoji="🎓" title="Études et diplômes">
              <FactList facts={p.education} empty="Aucun fait sourcé retenu." />
            </Section>
            <Section id="carriere" emoji="💼" title="Métier hors politique">
              <FactList facts={p.career} empty="Aucun fait sourcé retenu." />
            </Section>
          </div>

          <Section id="politique" emoji="🏛️" title="Parcours politique">
            <FactList facts={p.political} empty="Aucun fait sourcé retenu." />
          </Section>

          <Section id="mandats" emoji="🗳️" title="Mandats et fonctions" help={<Help title="Mandat">Fonction obtenue par une élection (député, maire, conseiller régional…) ou une nomination au gouvernement (ministre).</Help>}>
            {p.mandates.length === 0 ? (
              <p className="text-sm text-ink-3 italic">Aucun mandat électif ou fonction gouvernementale sourcé.</p>
            ) : (
              <ol className="relative border-l-2 border-border ml-1.5 space-y-4">
                {p.mandates.map((m, i) => (
                  <li key={i} className="pl-4 relative">
                    <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full border-2 border-surface" style={{ background: m.end ? "var(--border-2)" : color }} aria-hidden />
                    <div className="text-xs text-ink-3 num">
                      {m.start ? fmtSourceDate(m.start) : "?"} → {m.end ? fmtSourceDate(m.end) : <strong className="text-ink-2">en cours</strong>}
                    </div>
                    <div className="text-[15px] font-semibold leading-snug">
                      {m.role}
                      <SourceRefs sources={m.sources} />
                    </div>
                    <div className="text-sm text-ink-2">{m.institution}</div>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section id="patrimoine" emoji="📄" title="Patrimoine et intérêts déclarés" help={<Help title="HATVP">La Haute Autorité pour la transparence de la vie publique reçoit et publie les déclarations de patrimoine et d&apos;intérêts des élus et membres du gouvernement. Les montants sont ceux déclarés par l&apos;élu, à la date de la déclaration.</Help>}>
            <FactList facts={p.assets} empty="Aucun élément de patrimoine n'a pu être établi par un document officiel (HATVP, Journal officiel). Rien n'est affiché qui ne soit vérifié." />
          </Section>

          <Section id="justice" emoji="⚖️" title="Affaires judiciaires" help={<Help title="Comment cette rubrique est vérifiée">Recherche dédiée, puis relecture du texte de chaque article ou décision cité : une étape n&apos;est affichée que si un document officiel (décision ou communiqué d&apos;une juridiction, Cour de cassation, Conseil constitutionnel, Légifrance…) la mentionne explicitement (survolez une référence pour voir l&apos;extrait). Ni la presse, ni Wikipédia, ni les sources liées à la personne ne suffisent ici : sans document officiel, rien n&apos;est affiché.</Help>}>
            <JusticeSection affairs={p.justice} checkedAt={p.justice_checked_at} />
          </Section>

          <Section id="positions" emoji="🧭" title="Positions clés pour 2027">
            <FactList facts={p.positions} empty="Aucune position sourcée retenue." />
            {(party || programme) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {party && (
                  <Link href={`/partis/${party.id}`} className="btn-secondary text-sm">
                    Ce que {party.shortName} dit et vote, sujet par sujet
                  </Link>
                )}
                {programme && (
                  <Link href={`/programmes/${programme.id}`} className="btn-secondary text-sm">
                    Lire l&apos;analyse du programme
                  </Link>
                )}
              </div>
            )}
          </Section>

          {p.self_vs_sources.length > 0 && (
            <Section id="recit" emoji="🔍" title="Ce que la personne dit d'elle / ce que montrent les sources" help={<Help title="Pourquoi cette rubrique ?">Quand le récit qu&apos;une personnalité fait de sa propre vie ne correspond pas à ce qu&apos;établissent des sources indépendantes, Cohérence-Politique présente les deux, côte à côte, sans commentaire. À vous de juger.</Help>}>
              <div className="space-y-4">
                {p.self_vs_sources.map((s, i) => (
                  <div key={i}>
                    <div className="text-sm font-semibold mb-2">{s.topic}</div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-border bg-surface-2 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 mb-1 inline-flex items-center gap-1">
                          <Quote size={12} /> Version de la personne
                        </div>
                        <p className="text-[15px] leading-relaxed">
                          {s.candidate_says.text}
                          <SourceRefs sources={s.candidate_says.sources} />
                        </p>
                      </div>
                      <div className="rounded-xl border border-accent/30 bg-accent-soft p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-ink mb-1 inline-flex items-center gap-1">
                          <Search size={12} /> Ce que montrent les sources
                        </div>
                        <p className="text-[15px] leading-relaxed">
                          {s.sources_show.text}
                          <SourceRefs sources={s.sources_show.sources} />
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {p.gaps.length > 0 && (
            <Card title="Ce que les sources consultées ne permettent pas d'établir">
              <ul className="list-disc pl-5 text-sm text-ink-2 space-y-1">
                {p.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <div className="rounded-2xl border border-dashed border-border p-4 text-xs text-ink-3 leading-relaxed flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <p>
          Fiche rédigée par Cohérence-Politique à partir de sources publiques indépendantes (presse, institutions, décisions de justice) : chaque fait renvoie vers sa source. Même méthode et mêmes rubriques pour tous les candidats.
          {c.profileAt && <> Mise à jour le {fmtDate(c.profileAt)}.</>}
        </p>
        <a href={contactHref(c.fullName)} className="btn-secondary text-xs shrink-0 inline-flex items-center gap-1">
          <Flag size={12} /> Signaler une erreur <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}
