import Link from "next/link";
import { partyOverviews } from "@/lib/queries";
import { THEMES } from "@/lib/config/themes";
import { Card, PageHeader, SectionTitle, Verdict } from "@/components/ui";
import { themePlain } from "@/lib/config/plain";
import { AlignmentLegend, AlignmentRow } from "@/components/alignment";
import { BigGaps } from "@/components/big-gaps";
import { allAlignments } from "@/lib/queries-ecarts";

export const dynamic = "force-dynamic";

export default async function ComparePage(props: PageProps<"/comparer">) {
  const sp = await props.searchParams;
  const all = partyOverviews();
  const raw = sp.p;
  const selected = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((id) => all.some((p) => p.id === id));
  const align = allAlignments();
  const chosen = selected.length ? all.filter((p) => selected.includes(p.id)) : all.filter((p) => ["lfi", "ps", "renaissance", "lr", "rn"].includes(p.id));

  return (
    <div className="space-y-6">
      <PageHeader title="Comparer des partis" description="Ce qu'ils écrivent, ce qu'ils votent, ce qu'ils disent : sujet par sujet, et là où ça ne colle pas." />
      <AlignmentLegend />
      <section id="grands-ecarts">
        <SectionTitle title="Les grands écarts" href="/ecarts" more="Tous les écarts" />
        <BigGaps limit={6} showLegend={false} />
      </section>
      <SectionTitle title="Sujet par sujet" />
      <Card>
        <form method="get" className="flex flex-wrap gap-2 text-sm items-center">
          {all.map((p) => (
            <label key={p.id} className="pill cursor-pointer !py-1.5">
              <input type="checkbox" name="p" value={p.id} defaultChecked={chosen.some((c) => c.id === p.id)} className="sr-only" />
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              {p.shortName}
            </label>
          ))}
          <span className="ml-auto flex items-center gap-2">
            <a href={`/comparer?${all.map((p) => `p=${p.id}`).join("&")}`} className="btn-ghost text-sm">
              Tous les partis
            </a>
            <button className="btn-primary">Comparer</button>
          </span>
        </form>
      </Card>
      <div className="space-y-3">
        {THEMES.map((t) => (
          <Card key={t.id}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <Link href={`/themes/${t.id}`} className="font-semibold hover:underline">
                {t.emoji} {t.label}
              </Link>
              <span className="text-[11px] text-ink-3 text-right">
                ← {themePlain(t.id).left} · {themePlain(t.id).right} →
              </span>
            </div>
            <div className="space-y-2">
              {chosen.map((p) => {
                const s = p.scores.find((x) => x.theme === t.id);
                const a = align.get(`${p.id}|${t.id}`);
                if (!a) return null;
                return (
                  <AlignmentRow
                    key={p.id}
                    a={a}
                    themeId={t.id}
                    partyId={p.id}
                    partyShort={p.shortName}
                    head={
                      <Link href={`/partis/${p.id}`} className="flex items-center gap-1.5 font-semibold hover:underline">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                        {p.shortName}
                      </Link>
                    }
                    right={<Verdict v={s?.verdict} />}
                  />
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
