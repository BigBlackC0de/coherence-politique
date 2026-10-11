import { Scale, AlertTriangle, ShieldCheck } from "lucide-react";
import type { AffairStatus, CandidateAffair, JusticeStage } from "@/lib/db/schema";
import { SourceRefs, fmtSourceDate } from "@/components/candidate-ui";

export const AFFAIR_STATUS: Record<AffairStatus, { label: string; tone: "warn" | "bad" | "good" | "neutral"; closedWithoutConviction?: boolean }> = {
  enquete_en_cours: { label: "Enquête en cours", tone: "warn" },
  mise_en_examen: { label: "Mise en examen, pas de jugement", tone: "warn" },
  renvoi_devant_tribunal: { label: "Renvoi devant un tribunal, procès à venir", tone: "warn" },
  proces_en_cours: { label: "Procès en cours", tone: "warn" },
  condamnation_non_definitive: { label: "Condamnation non définitive (recours possible ou en cours)", tone: "bad" },
  condamnation_definitive: { label: "Condamnation définitive", tone: "bad" },
  relaxe_non_definitive: { label: "Relaxe, décision non définitive", tone: "good" },
  relaxe_definitive: { label: "Relaxe définitive", tone: "good", closedWithoutConviction: true },
  non_lieu_non_definitif: { label: "Non-lieu, décision non définitive", tone: "good" },
  non_lieu_definitif: { label: "Non-lieu définitif", tone: "good", closedWithoutConviction: true },
  classement_sans_suite: { label: "Classement sans suite", tone: "good", closedWithoutConviction: true },
  decision_finalite_non_etablie: { label: "Décision rendue ; caractère définitif non établi par un document officiel", tone: "neutral" },
  inconnu: { label: "État actuel non établi", tone: "neutral" },
};

const STAGE: Record<JusticeStage, string> = {
  plainte: "Plainte",
  enquete: "Enquête",
  garde_a_vue: "Garde à vue",
  mise_en_examen: "Mise en examen",
  requisitions: "Réquisitions du parquet",
  non_lieu: "Non-lieu",
  appel: "Appel",
  renvoi_proces: "Renvoi devant le tribunal",
  proces: "Procès",
  condamnation: "Condamnation",
  relaxe: "Relaxe",
  classement_sans_suite: "Classement sans suite",
  cassation: "Cassation",
  autre: "Étape",
};

const TONE: Record<string, string> = {
  warn: "text-warn border-warn/40 bg-warn/10",
  bad: "text-bad border-bad/40 bg-bad/10",
  good: "text-good border-good/40 bg-good/10",
  neutral: "text-ink-2 border-border bg-surface-2",
};

/** Rubrique « Affaires judiciaires » : statut actuel d'abord, chronologie vérifiée ensuite. */
export function JusticeSection({ affairs, checkedAt }: { affairs: CandidateAffair[] | undefined; checkedAt: string | undefined }) {
  // Anciennes fiches (avant la passe vérifiée) : on n'affiche rien plutôt qu'un contenu non contrôlé.
  const valid = (affairs ?? []).filter((a) => Array.isArray(a.steps));
  if (!checkedAt) return <p className="text-sm text-ink-3 italic">Rubrique en cours de vérification.</p>;
  if (!valid.length)
    return (
      <p className="text-sm text-ink-3 italic">
        Aucune procédure n&apos;est affichée : cette rubrique ne présente que ce qu&apos;établit un document officiel, et aucun n&apos;a pu être vérifié (contrôle du {fmtSourceDate(checkedAt.slice(0, 10))}). Cela ne signifie pas qu&apos;il n&apos;en existe pas.
      </p>
    );
  return (
    <div className="space-y-5">
      {valid.map((a, i) => {
        const st = AFFAIR_STATUS[a.current_status] ?? AFFAIR_STATUS.inconnu;
        const last = a.steps[a.steps.length - 1];
        return (
          <article key={i} className="rounded-2xl border border-border p-3 md:p-4">
            <h3 className="text-[15px] md:text-base font-bold leading-snug">{a.title}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-0.5 text-xs font-semibold ${TONE[st.tone]}`}>
                {st.closedWithoutConviction ? <ShieldCheck size={12} /> : <Scale size={12} />} {st.label}
              </span>
              {a.current_date && <span className="text-xs text-ink-3">{fmtSourceDate(a.current_date)}</span>}
              {a.current_jurisdiction && <span className="text-xs text-ink-3">· {a.current_jurisdiction}</span>}
            </div>
            <p className="mt-2 text-[15px] leading-relaxed font-medium">{a.current_summary}</p>
            {!a.current_confirmed && (
              <p className="mt-2 text-xs text-warn inline-flex items-start gap-1">
                <AlertTriangle size={13} className="shrink-0 mt-px" /> État actuel non confirmé par une source récente
                {last?.date ? ` (dernière étape vérifiée : ${fmtSourceDate(last.date)})` : ""}.
              </p>
            )}
            {a.contradiction && <p className="mt-2 text-xs text-ink-2">Les sources divergent : {a.contradiction}</p>}

            <p className="mt-3 text-sm">
              <span className="text-ink-3">Faits reprochés : </span>
              {a.charges}
              {a.charges_sources.length > 0 && <SourceRefs sources={a.charges_sources} />}
            </p>

            <details className="mt-3 group" open={a.steps.length <= 4}>
              <summary className="cursor-pointer text-xs font-semibold text-ink-2 select-none">Chronologie vérifiée ({a.steps.length} étape{a.steps.length > 1 ? "s" : ""})</summary>
              <ol className="relative border-l-2 border-border ml-1.5 mt-3 space-y-3">
                {a.steps.map((s, k) => (
                  <li key={k} className="pl-4 relative">
                    <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full border-2 border-surface bg-border-2" aria-hidden />
                    <div className="text-xs text-ink-3">
                      <span className="font-semibold text-ink-2">{STAGE[s.stage] ?? "Étape"}</span>
                      {s.date && <> · {fmtSourceDate(s.date)}</>}
                      {s.jurisdiction && <> · {s.jurisdiction}</>}
                    </div>
                    <p className="text-sm leading-relaxed">
                      {s.text}
                      <SourceRefs sources={s.sources} />
                    </p>
                    {s.sources.length === 1 && <p className="text-[11px] text-ink-3">Une seule source vérifiée pour cette étape.</p>}
                  </li>
                ))}
              </ol>
            </details>

            {a.response && (
              <p className="mt-3 text-sm text-ink-2">
                <span className="text-ink-3">Réaction de la personne : </span>
                {a.response.text}
                <SourceRefs sources={a.response.sources} />
              </p>
            )}

            <p className="mt-3 text-xs text-ink-3 leading-relaxed">
              {st.closedWithoutConviction ? (
                <strong className="text-good">Affaire close sans condamnation.</strong>
              ) : a.current_status === "condamnation_definitive" ? (
                "Décision définitive : plus aucun recours ordinaire possible."
              ) : (
                <>
                  <strong>Présomption d&apos;innocence :</strong> tant qu&apos;une personne n&apos;a pas été définitivement condamnée (après épuisement des recours : appel, cassation), elle est présumée innocente.
                </>
              )}
            </p>
          </article>
        );
      })}
    </div>
  );
}
