import type { CandidatePhoto, CandidateSource } from "@/lib/db/schema";
import { Help } from "@/components/help";

export const PARRAINAGES_HELP =
  "Pour être candidat à l'élection présidentielle, il faut réunir au moins 500 « parrainages » (signatures) d'élus — maires, parlementaires, conseillers départementaux ou régionaux… — venant d'au moins 30 départements ou collectivités d'outre-mer différents, sans que plus de 50 viennent du même. C'est le Conseil constitutionnel qui vérifie les signatures et publie la liste officielle des candidats, quelques semaines avant le premier tour (pour 2027 : attendue en mars). D'ici là, les personnes listées ici sont des candidats déclarés ou pressentis.";

export const SCOPE_HELP =
  "Une personne déclarée (ou pressentie) candidate est présentée si elle remplit au moins un de ces critères : 1) son parti compte au moins un parlementaire en exercice (député, sénateur ou député européen), ou elle l'est elle-même ; 2) elle a déjà été candidate officielle à une élection présidentielle (500 signatures validées par le Conseil constitutionnel) ; 3) elle obtient au moins 1 % des intentions de vote dans au moins un sondage national publié depuis moins de trois mois par un institut reconnu. Chaque critère est vérifié avec une source. Les personnes qui disent ne pas être candidates ne sont pas présentées.";

/** Portrait : photo libre de Wikimedia Commons, sinon initiales sur la couleur du parti. */
export function CandidatePortrait({ photo, initials, color, name, className = "", textSize = "text-4xl" }: { photo: CandidatePhoto | null; initials: string; color: string; name: string; className?: string; textSize?: string }) {
  if (photo) {
    return (
      <div className={`relative overflow-hidden bg-surface-2 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- vignette déjà dimensionnée par Wikimedia, crédit affiché à côté */}
        <img src={photo.url} alt={`Portrait de ${name}`} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover object-top" />
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden flex items-center justify-center ${className}`} style={{ background: `linear-gradient(145deg, color-mix(in srgb, ${color} 85%, white), color-mix(in srgb, ${color} 55%, black))` }} aria-label={`${name} (pas de photo sous licence libre)`} role="img">
      <span className={`font-extrabold tracking-tight text-white/95 ${textSize}`}>{initials}</span>
    </div>
  );
}

const STATUS_WORDS: Record<string, string> = { declare: "Candidature déclarée", pressenti: "Candidature pressentie", officiel: "Candidature officielle", retire: "A renoncé" };

/** Pastille de statut : rouge « En attente des 500 signatures » tant que le Conseil constitutionnel n'a pas validé. */
export function CandidateStatusBadge({ status, withHelp = true }: { status: string; withHelp?: boolean }) {
  if (status === "officiel") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-good/40 bg-good/10 text-good px-2.5 py-0.5 text-xs font-semibold">
        <span className="w-2 h-2 rounded-full bg-good" aria-hidden /> Candidature officielle · 500 signatures validées
      </span>
    );
  }
  if (status === "retire") {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 text-ink-3 px-2.5 py-0.5 text-xs font-semibold">A renoncé à se présenter</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-bad/40 bg-bad/10 text-bad px-2.5 py-0.5 text-xs font-semibold leading-tight">
        <span className="w-2 h-2 shrink-0 rounded-full bg-bad animate-pulse" aria-hidden /> En attente des 500 signatures
      </span>
      {withHelp && <Help title="Les 500 signatures, c'est quoi ?">{PARRAINAGES_HELP}</Help>}
    </span>
  );
}

export const statusWords = (s: string) => STATUS_WORDS[s] ?? s;

const fmtSourceDate = (d: string | null | undefined) => {
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  if (/^\d{4}-\d{2}$/.test(d)) return new Date(`${d}-01`).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
  return d;
};

/** Petites références cliquables [1] [2] vers les sources d'un fait. */
export function SourceRefs({ sources, start = 1 }: { sources: CandidateSource[]; start?: number }) {
  return (
    <span>
      {sources.map((s, i) => (
        <a
          key={s.url + i}
          href={s.url}
          target="_blank"
          rel="noreferrer noopener"
          title={`${s.publisher}${s.date ? ` · ${fmtSourceDate(s.date)}` : ""}${s.title ? ` — ${s.title}` : ""}${(s as { quote?: string }).quote ? `
« ${(s as { quote?: string }).quote} »` : ""}`}
          className="ml-1 inline-flex items-center whitespace-nowrap rounded-md border border-border bg-surface-2 px-1.5 py-px text-[10.5px] font-semibold text-ink-2 hover:border-accent hover:text-accent-ink align-[1px]"
        >
          {s.publisher.length > 22 ? `${s.publisher.slice(0, 20)}…` : s.publisher}
          {s.date ? <span className="font-normal text-ink-3 ml-1">{fmtSourceDate(s.date).replace(/^\d+ /, "")}</span> : null}
          <span className="sr-only"> (source {start + i})</span>
        </a>
      ))}
    </span>
  );
}

export { fmtSourceDate };
