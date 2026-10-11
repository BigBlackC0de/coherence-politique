import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader, Empty, fmtDate } from "@/components/ui";
import { Explain, Help } from "@/components/help";
import { CandidatePortrait, CandidateStatusBadge, PARRAINAGES_HELP, SCOPE_HELP, statusWords } from "@/components/candidate-ui";
import { listCandidates, ageFrom, initials } from "@/lib/queries-candidates";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Candidats à la présidentielle 2027",
  description: "Qui sont les candidats à l'élection présidentielle de 2027 ? Fiches biographiques factuelles, chaque fait relié à une source indépendante.",
};

export default function CandidatsPage() {
  const { candidates, parties } = listCandidates();
  const active = candidates.filter((c) => c.status !== "retire");
  const withdrawn = candidates.filter((c) => c.status === "retire");
  const officialCount = candidates.filter((c) => c.status === "officiel").length;
  const lastUpdate = candidates.reduce<string | null>((m, c) => (!m || c.updatedAt > m ? c.updatedAt : m), null);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Présidentielle 2027"
        title="Les candidats"
        description="Qui sont-ils vraiment ? Pour chaque personne : son histoire, ses études, son métier, ses mandats, son patrimoine déclaré et ses éventuelles affaires judiciaires. Chaque fait renvoie vers une source indépendante (presse, institutions, justice), jamais vers ce que la personne dit d'elle-même."
      />

      <Explain title="Liste officielle : pas avant mars 2027">
        Pour se présenter, il faut <Help label="500 signatures d'élus" title="Les 500 parrainages">{PARRAINAGES_HELP}</Help>. Le Conseil constitutionnel publiera la liste officielle quelques semaines avant le premier tour. En attendant, Cohérence-Politique présente les candidatures <strong>déclarées</strong> ou <strong>pressenties</strong> d&apos;après la presse, avec une pastille rouge tant que les signatures ne sont pas validées.
        {officialCount > 0 && <> {officialCount} candidature(s) déjà validée(s).</>}
        <span className="block mt-2">
          Qui est présenté ici ? Les personnes qui ont annoncé leur candidature et qui ont des élus au Parlement, ou ont déjà été candidates officielles, ou font au moins 1 % dans un sondage récent.{" "}
          <Help title="Les trois critères, identiques pour tous">{SCOPE_HELP}</Help>
        </span>
      </Explain>

      {active.length === 0 ? (
        <Empty>Aucune fiche pour l&apos;instant : les candidatures seront ajoutées après la prochaine recherche.</Empty>
      ) : (
        <>
          <p className="text-xs text-ink-3">
            {active.length} personne{active.length > 1 ? "s" : ""}, par ordre alphabétique (l&apos;ordre ne reflète ni les sondages ni une préférence).
            {lastUpdate && <> Mise à jour : {fmtDate(lastUpdate)}.</>}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-5">
            {active.map((c) => {
              const party = c.partyId ? parties.get(c.partyId) : undefined;
              const color = party?.color ?? "var(--neutral)";
              const age = ageFrom(c.birthDate);
              return (
                <Link key={c.id} href={`/candidats/${c.id}`} className="card card-hover overflow-hidden flex flex-col group focus-visible:outline-2 focus-visible:outline-accent">
                  <div className="relative">
                    <CandidatePortrait photo={c.photo} initials={initials(c)} color={party?.color ?? "#8a909a"} name={c.fullName} className="aspect-[4/5] w-full" textSize="text-5xl" />
                    <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: color }} />
                  </div>
                  <div className="p-3 md:p-4 flex flex-col gap-1.5 flex-1">
                    <div className="text-[15px] md:text-lg font-bold leading-tight tracking-tight group-hover:text-accent-ink">{c.fullName}</div>
                    <div className="flex items-center gap-1.5 text-xs text-ink-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                      <span className="truncate">{party?.shortName ?? c.partyLabel ?? "Sans étiquette"}</span>
                      {age !== null && <span className="text-ink-3 shrink-0">· {age} ans</span>}
                    </div>
                    {c.tagline && <p className="text-xs text-ink-3 leading-snug line-clamp-3">{c.tagline}</p>}
                    <div className="mt-auto pt-2 space-y-1">
                      <div className="text-[11px] text-ink-3">{statusWords(c.status)}</div>
                      <CandidateStatusBadge status={c.status} withHelp={false} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {withdrawn.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink-2">Ont renoncé</h2>
          <div className="flex flex-wrap gap-2">
            {withdrawn.map((c) => (
              <Link key={c.id} href={`/candidats/${c.id}`} className="pill">
                {c.fullName}
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-ink-3 leading-relaxed max-w-3xl">
        Fiches rédigées par Cohérence-Politique à partir de sources publiques et indépendantes, vérifiées automatiquement (tout fait sans source valide est retiré). Photos : Wikimedia Commons, sous licence libre, crédit sur chaque fiche ; à défaut, initiales. Une erreur ? Signalez-la depuis la fiche concernée.
      </p>
    </div>
  );
}
