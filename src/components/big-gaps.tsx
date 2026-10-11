import Link from "next/link";
import { Hourglass } from "lucide-react";
import { bigGaps, ecartsStatus } from "@/lib/queries-ecarts";
import { THEME_BY_ID } from "@/lib/config/themes";
import { ECART_CAVEAT } from "@/lib/config/plain";
import { AlignmentLegend, AlignmentRow } from "./alignment";
import { fmtInt } from "./ui";

/**
 * « Les grands écarts » : les divergences programme / votes / discours les plus fortes,
 * seulement celles qui passent les seuils de fiabilité. Composant serveur (lit la base).
 */
export function BigGaps({ limit, showLegend = true, moreHref }: { limit?: number; showLegend?: boolean; moreHref?: string }) {
  const all = bigGaps();
  const gaps = limit ? all.slice(0, limit) : all;
  const st = ecartsStatus();
  return (
    <div className="space-y-3">
      {showLegend && <AlignmentLegend />}
      {gaps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-5 flex gap-3 items-start">
          <Hourglass size={20} className="text-accent-ink shrink-0 mt-0.5" aria-hidden />
          <div className="text-sm text-ink-2 leading-relaxed">
            <p className="font-semibold text-ink">Aucun écart ne passe encore nos seuils de fiabilité.</p>
            <p className="mt-1">
              Les prises de parole sont en cours d&apos;analyse ({fmtInt(st.postsAnalyzed)} sur {fmtInt(st.posts)} lues pour l&apos;instant). Les écarts apparaîtront ici au fur et à mesure, seulement
              quand ils reposent sur assez de preuves.
            </p>
          </div>
        </div>
      ) : (
        <>
          <ul className="grid lg:grid-cols-2 gap-3 [&>*]:min-w-0">
            {gaps.map((g) => {
              const t = THEME_BY_ID[g.themeId];
              return (
                <li key={`${g.partyId}-${g.themeId}`}>
                  <AlignmentRow
                    a={g}
                    themeId={g.themeId}
                    partyId={g.partyId}
                    partyShort={g.shortName}
                    showScale
                    className="h-full bg-surface"
                    head={
                      <span className="flex items-center gap-2 font-bold min-w-0 w-full">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: g.color }} />
                        <Link href={`/partis/${g.partyId}`} className="hover:underline">
                          {g.shortName}
                        </Link>
                        <span className="text-ink-3 font-normal">·</span>
                        <Link href={`/themes/${g.themeId}`} className="hover:underline truncate">
                          {t?.emoji} {t?.label}
                        </Link>
                      </span>
                    }
                  />
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-ink-3">
            {all.length} écart{all.length > 1 ? "s" : ""} sur {st.comparable} cas comparables aujourd&apos;hui. Les prises de parole sont encore en cours d&apos;analyse ({fmtInt(st.postsAnalyzed)} sur{" "}
            {fmtInt(st.posts)}) : la liste va s&apos;allonger.{" "}
            {moreHref && all.length > gaps.length && (
              <Link href={moreHref} className="font-semibold text-accent-ink hover:underline">
                Voir les {all.length} écarts →
              </Link>
            )}
          </p>
        </>
      )}
      {!showLegend && <p className="text-xs text-ink-3">{ECART_CAVEAT}</p>}
    </div>
  );
}
