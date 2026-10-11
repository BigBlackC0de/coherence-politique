import Link from "next/link";
import { ArrowRight, MessageCircleQuestion } from "lucide-react";
import { partyOverviews, dataStatus, themeStats, verdictCounts } from "@/lib/queries";
import { recentExplainedVotes } from "@/lib/queries-debates";
import { Compass } from "@/components/compass";
import { SearchBox } from "@/components/search-box";
import { Explain } from "@/components/help";
import { Card, Empty, SectionTitle, fmtDate, fmtInt } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { BigGaps } from "@/components/big-gaps";
import { THEMES } from "@/lib/config/themes";
import { signed } from "@/components/calc";
import type { PartyOverview } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const parties = partyOverviews();
  const status = dataStatus();
  const themes = themeStats();
  const ready = status.classified > 0;
  const admin = await isAdmin();
  const verdicts = verdictCounts();
  const verdictTotal = Object.values(verdicts).reduce((a, b) => a + b, 0);
  const coherentShare = verdictTotal ? Math.round(((verdicts.coherent ?? 0) / verdictTotal) * 100) : null;
  const explained = recentExplainedVotes(4);
  const totalVotes = status.scrutinsAN + status.scrutinsSenat;

  return (
    <div className="space-y-12 md:space-y-16">
      {/* ---- Accroche ---- */}
      <section className="rise grid lg:grid-cols-[1.15fr_0.85fr] gap-8 items-center">
        <div>
          <div className="eyebrow mb-3">Gratuit, indépendant, sans parti pris</div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.04]">
            Les partis font-ils <span className="underline decoration-[0.09em] underline-offset-[0.14em]">ce qu&apos;ils disent</span> ?
          </h1>
          <p className="text-ink-2 mt-5 text-lg max-w-2xl leading-relaxed">On compare ce que les partis promettent et ce que leurs élus votent, à l&apos;Assemblée et au Sénat. En mots simples, avec les preuves.</p>
          <SearchBox size="lg" placeholder="Un élu, un département, un sujet…" className="mt-6 max-w-xl" />
          <div className="flex flex-wrap gap-3 mt-5">
            <Link href="/partis" className="btn-primary !text-base !px-6 !py-3">
              Voir les partis <ArrowRight size={18} />
            </Link>
            <Link href="/comprendre" className="btn-secondary !text-base !px-6 !py-3">
              Comment ça marche ?
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: fmtInt(totalVotes), label: "votes au Parlement", href: "/scrutins" },
            { value: fmtInt(status.documentsAnalyzed), label: "programmes lus", href: "/programmes" },
            { value: fmtInt(status.posts), label: "prises de parole", href: "/prises-de-parole" },
            { value: coherentShare === null ? "—" : `${coherentShare} %`, label: "des sujets où le parti fait ce qu'il dit", href: "/partis" },
          ].map((s) => (
            <Link key={s.label} href={s.href} className="card card-hover p-4 md:p-5 block">
              <div className="text-3xl md:text-4xl font-extrabold num tracking-tight">{s.value}</div>
              <div className="text-sm text-ink-2 mt-1 leading-snug">{s.label}</div>
            </Link>
          ))}
        </div>
      </section>

      {!ready && admin && (
        <Explain title="Première mise en route" tone="warn">
          Dans Données &amp; jobs, lancez « Classifier les scrutins », puis « Programmes : tout automatiser », « Importer les prises de parole » et enfin « Synthèses dire / faire ».
        </Explain>
      )}

      {/* ---- Les grands écarts ---- */}
      <section id="grands-ecarts">
        <SectionTitle title="Les grands écarts" href="/ecarts" more="Tous les écarts" />
        <p className="text-ink-2 -mt-2 mb-4 max-w-3xl">Programme, votes et prises de parole, sur un même axe : quand ils s&apos;éloignent, on le montre, avec les preuves.</p>
        <BigGaps limit={4} moreHref="/ecarts" />
      </section>

      {/* ---- Comment ça marche, en trois temps ---- */}
      <section className="grid sm:grid-cols-3 gap-3">
        {[
          { emoji: "📄", title: "Ils promettent", text: "On lit leurs programmes." },
          { emoji: "🗳️", title: "Ils votent", text: "On lit chaque vote." },
          { emoji: "⚖️", title: "On compare", text: "On montre l'écart." },
        ].map((s) => (
          <div key={s.title} className="card-soft p-4 md:p-5 flex items-center gap-4">
            <span className="text-3xl shrink-0" aria-hidden>
              {s.emoji}
            </span>
            <div>
              <h2 className="text-lg font-bold leading-tight">{s.title}</h2>
              <p className="text-ink-2 text-sm">{s.text}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ---- Par sujet ---- */}
      <section>
        <SectionTitle title="Choisissez un sujet" href="/themes" more="Tous les sujets" />
        <div className="flex flex-wrap gap-2">
          {themes.map((t) => (
            <Link key={t.id} href={`/themes/${t.id}`} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-[15px] font-semibold hover:border-accent hover:bg-surface-2">
              <span aria-hidden>{t.emoji}</span> {t.label}
            </Link>
          ))}
        </div>
      </section>

      {/* ---- Votes expliqués ---- */}
      <section>
        <SectionTitle title="Pourquoi ils ont voté comme ça" href="/scrutins?explique=1" more="Tous les votes expliqués" />
        {explained.length === 0 ? (
          <Empty>Les premiers votes expliqués arrivent bientôt.</Empty>
        ) : (
          <ul className="grid md:grid-cols-2 gap-3">
            {explained.map((v) => (
              <li key={v.uid}>
                <Link href={`/scrutins/${v.uid}#pourquoi`} className="card card-hover p-4 md:p-5 flex flex-col gap-2 h-full">
                  <span className="text-xs text-ink-3">
                    {fmtDate(v.date)} · {v.chamber === "SENAT" ? "Sénat" : "Assemblée"}
                    {v.sort && (
                      <>
                        {" · "}
                        <span className={v.sort === "adopté" ? "text-good font-semibold" : "text-bad font-semibold"}>{v.sort}</span>
                      </>
                    )}
                  </span>
                  <span className="font-bold text-[17px] leading-snug">{v.titre ?? v.summary ?? v.title}</span>
                  {v.enjeu && <span className="text-sm text-ink-2 line-clamp-2">{v.enjeu}</span>}
                  <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-accent-ink">
                    <MessageCircleQuestion size={16} /> Lire l&apos;explication
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Boussole ---- */}
      <section>
        <SectionTitle title="Où sont les partis ?" href="/comparer" more="Comparer les partis" />
        <Card>
          <div className="grid lg:grid-cols-[minmax(0,620px)_1fr] gap-8 items-start">
            <Compass parties={parties.map((p) => ({ id: p.id, shortName: p.shortName, name: p.name, color: p.color, declared: p.compass.declared, voted: p.compass.voted }))} />
            <div className="space-y-3 text-[15px] text-ink-2 leading-relaxed">
              <p>
                <strong className="text-ink">De gauche à droite :</strong> l&apos;économie. À gauche : plus d&apos;État et de partage. À droite : plus de marché et moins d&apos;impôts.
              </p>
              <p>
                <strong className="text-ink">De bas en haut :</strong> la société. En bas : ouverture et libertés. En haut : ordre et frontières.
              </p>
              <p>
                Chaque parti apparaît deux fois : <strong className="text-ink">le rond vide</strong> pour ce qu&apos;il dit, <strong className="text-ink">le rond plein</strong> pour ce qu&apos;il vote. Plus le trait est long, plus l&apos;écart est grand.
              </p>
              <CompassCalc parties={parties} />
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

/** Le calcul de la boussole, parti par parti : moyenne simple des positions sur les sujets de chaque axe. */
function CompassCalc({ parties }: { parties: PartyOverview[] }) {
  const axes = [
    { key: "x" as const, label: "Gauche ↔ droite (économie)", themes: THEMES.filter((t) => t.group === "eco") },
    { key: "y" as const, label: "Bas ↕ haut (société)", themes: THEMES.filter((t) => t.group === "societal") },
  ];
  const line = (p: PartyOverview, themes: typeof THEMES, pick: "votedStance" | "declaredStance", result: number | null) => {
    const vals = themes.map((t) => p.scores.find((s) => s.theme === t.id)?.[pick] ?? null);
    return (
      <span className="num">
        {vals.map((v, i) => (
          <span key={themes[i].id} title={themes[i].label}>
            {i > 0 && " · "}
            {v === null ? "—" : signed(v)}
          </span>
        ))}{" "}
        → <strong className="text-ink">{result === null ? "—" : signed(result)}</strong>
      </span>
    );
  };
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold text-accent-ink hover:underline">Voir le calcul de la boussole</summary>
      <p className="mt-2 text-ink-2">
        Chaque point est la moyenne simple des positions du parti sur les sujets de l&apos;axe, de −1 à +1 (un sujet sans position est laissé de côté).{" "}
        {axes.map((ax, i) => (
          <span key={ax.key}>
            {i > 0 && " "}
            {ax.label} : {ax.themes.map((t) => t.label).join(", ")}.
          </span>
        ))}{" "}
        Chaque position vient de son propre calcul, visible sur la page du parti.
      </p>
      <div className="overflow-x-auto mt-2">
        <table className="table text-xs">
          <thead>
            <tr>
              <th>Parti</th>
              {axes.map((ax) => (
                <th key={ax.key}>{ax.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parties.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/partis/${p.id}`} className="font-medium hover:underline whitespace-nowrap">
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: p.color }} />
                    {p.shortName}
                  </Link>
                </td>
                {axes.map((ax) => (
                  <td key={ax.key} className="text-ink-2">
                    <div>vote : {line(p, ax.themes, "votedStance", p.compass.voted[ax.key])}</div>
                    <div>dit : {line(p, ax.themes, "declaredStance", p.compass.declared[ax.key])}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
