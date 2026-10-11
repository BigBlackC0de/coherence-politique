import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { partyOverviews } from "@/lib/queries";
import { Card, PageHeader } from "@/components/ui";
import { HBars } from "@/components/charts";
import { Help } from "@/components/help";
import { VERDICT_PLAIN, gapWords } from "@/lib/config/plain";

export const dynamic = "force-dynamic";

const TONE_TEXT: Record<string, string> = { good: "text-good", warn: "text-warn", bad: "text-bad", muted: "text-ink-3" };
const VERDICT_KEYS = ["coherent", "nuance", "ecart", "contradiction", "insuffisant"] as const;
const VERDICT_COLOR: Record<string, string> = { coherent: "var(--good)", nuance: "var(--neutral)", ecart: "var(--warn)", contradiction: "var(--bad)", insuffisant: "var(--border-2)" };

export default function PartiesPage() {
  const parties = partyOverviews();
  const gaps = parties
    .filter((p) => p.avgGap !== null)
    .sort((a, b) => (a.avgGap ?? 0) - (b.avgGap ?? 0))
    .map((p) => ({ id: p.id, name: p.shortName, value: p.avgGap ?? 0, color: p.color, hint: `${p.name} : ${gapWords(p.avgGap).label}`, href: `/partis/${p.id}` }));

  return (
    <div className="space-y-10">
      <PageHeader eyebrow={`${parties.length} partis suivis`} title="Les partis" description="Classés de la gauche à la droite. Ouvrez une fiche pour voir, sujet par sujet, ce que le parti promet et ce qu'il vote." />

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {parties.map((p) => {
          const verdictsTotal = Object.values(p.verdicts).reduce((a, b) => a + b, 0);
          const gw = gapWords(p.avgGap);
          return (
            <Link key={p.id} href={`/partis/${p.id}`} className="card card-hover overflow-hidden flex flex-col group">
              <div className="h-2" style={{ background: p.color }} />
              <div className="p-4 md:p-5 flex-1 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center text-white text-sm font-extrabold" style={{ background: p.color }} aria-hidden>
                    {p.shortName.slice(0, 3)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-lg leading-tight group-hover:underline">{p.name}</div>
                    <div className="text-sm text-ink-3 mt-0.5">
                      {p.deputes} député{p.deputes > 1 ? "s" : ""} · {p.senateurs} sénateur{p.senateurs > 1 ? "s" : ""}
                    </div>
                  </div>
                  <ArrowRight size={18} className="text-ink-3 shrink-0" />
                </div>
                <div className="mt-auto flex items-center justify-between gap-3">
                  <span className={`font-bold ${TONE_TEXT[gw.tone]}`}>{gw.label.charAt(0).toUpperCase() + gw.label.slice(1)}</span>
                  {verdictsTotal > 0 && (
                    <span className="flex h-2.5 w-24 rounded-full overflow-hidden gap-px" title="Résultat sujet par sujet : vert = fait ce qu'il dit, orange = pas vraiment, rouge = vote l'inverse">
                      {VERDICT_KEYS.map((k) => (p.verdicts[k] ? <span key={k} style={{ width: `${(p.verdicts[k] / verdictsTotal) * 100}%`, background: VERDICT_COLOR[k] }} /> : null))}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="-mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-2">
        <span className="text-ink-3">La petite barre colorée : le résultat sur chaque sujet.</span>
        {VERDICT_KEYS.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: VERDICT_COLOR[k] }} /> {VERDICT_PLAIN[k].label}
          </span>
        ))}
      </div>

      <Card
        title={
          <>
            Qui fait le plus ce qu&apos;il dit ? <Help k="ecart" />
          </>
        }
        subtitle="écart moyen entre ce qu'il dit et ce qu'il vote. Barre courte = le parti tient parole."
      >
        {gaps.length ? <HBars data={gaps} max={Math.max(0.6, ...gaps.map((g) => g.value))} format="fixed2" /> : <p className="text-sm text-ink-3">Les écarts apparaîtront quand les programmes et les votes auront été lus.</p>}
        <p className="text-xs text-ink-3 mt-3 leading-relaxed">Un écart n&apos;est pas forcément un mensonge. Un parti d&apos;opposition vote souvent contre les textes du gouvernement. Et un programme flou se compare mal.</p>
      </Card>
    </div>
  );
}
