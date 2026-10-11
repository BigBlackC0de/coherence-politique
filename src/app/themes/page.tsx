import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { themeStats } from "@/lib/queries";
import { PageHeader, fmtInt } from "@/components/ui";
import { themePlain } from "@/lib/config/plain";

export const dynamic = "force-dynamic";

export default function ThemesPage() {
  const themes = themeStats();
  return (
    <div className="space-y-8">
      <PageHeader eyebrow={`${themes.length} grands sujets`} title="Les sujets" description="Chaque sujet pose une question, avec deux réponses opposées. Ouvrez-en un pour voir où se placent les partis, et s'ils font ce qu'ils disent." />
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {themes.map((t) => {
          const pl = themePlain(t.id);
          return (
            <Link key={t.id} href={`/themes/${t.id}`} className="card card-hover p-5 flex flex-col group">
              <div className="flex items-center gap-3">
                <span className="text-3xl" aria-hidden>
                  {t.emoji}
                </span>
                <span className="font-bold text-lg leading-tight group-hover:underline">{t.label}</span>
              </div>
              <p className="text-ink-2 text-[15px] mt-3 leading-relaxed">{pl.question}</p>
              <div className="grid grid-cols-2 gap-2 mt-4 text-xs font-semibold">
                <div className="rounded-xl p-2.5 bg-left/10">← {pl.left}</div>
                <div className="rounded-xl p-2.5 bg-right/10 text-right">{pl.right} →</div>
              </div>
              <div className="mt-auto pt-4 flex items-center justify-between text-xs text-ink-3">
                <span>{fmtInt(t.n)} votes sur ce sujet</span>
                <span className="inline-flex items-center gap-1 font-semibold text-accent-ink">
                  Voir <ArrowRight size={12} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
