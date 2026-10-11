import type { NextRequest } from "next/server";
import { partyOverviews } from "@/lib/queries";
import { THEMES } from "@/lib/config/themes";
import { gapWords } from "@/lib/config/plain";
import { C, Frame, Eyebrow, Pill, StanceBar, StanceLegend, Dot, st, parseFormat, siteHost, validId, notFoundImage, badFormat, renderImage } from "@/lib/share/render";

export const dynamic = "force-dynamic";

/** Image « un parti » : ses positions sur les 11 sujets (programme = anneau, votes = disque). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const f = parseFormat(req);
  if (!f) return badFormat();
  if (!validId(id)) return notFoundImage();
  const party = partyOverviews().find((p) => p.id === id);
  if (!party) return notFoundImage();
  const { host, trusted } = siteHost(req);
  const s = f.s;
  const og = f.id === "og";
  const story = f.id === "story";
  const gw = gapWords(party.avgGap);

  const contentW = f.w - 2 * f.pad;
  const labelW = og ? 230 : story ? contentW : 330;
  // largeur utile : colonne de droite (og) ou carte blanche (marges internes 30 et bordure 2)
  const innerW = og ? contentW - 340 - 40 : contentW - 2 * 30 * s - 4;
  const barW = Math.round(story ? innerW - 16 : innerW - labelW - 20 - 16);
  const rows = THEMES.map((t) => ({ t, sc: party.scores.find((x) => x.theme === t.id) }));

  const rowEl = ({ t, sc }: (typeof rows)[number]) => (
    <div key={t.id} style={{ ...(story ? st.col : st.row), gap: story ? 4 * s : 20 * s }}>
      <div style={{ display: "flex", width: labelW, fontSize: (story ? 26 : og ? 24 : 23) * s, fontWeight: 600, color: sc ? C.ink : C.ink3 }}>{t.label}</div>
      {sc && (sc.declaredStance !== null || sc.votedStance !== null) ? (
        <StanceBar declared={sc.declaredStance} voted={sc.votedStance} width={barW} height={Math.round((story ? 14 : 13) * s)} />
      ) : (
        <div style={{ display: "flex", fontSize: 21 * s, color: C.ink3 }}>pas encore de données</div>
      )}
    </div>
  );

  const legend = (
    <div style={{ ...st.col, gap: 8 * s }}>
      <StanceLegend f={f} />
      <div style={{ ...st.row, fontSize: 21 * s, gap: 14 * s, color: C.ink3 }}>
        <div style={{ display: "flex", width: 60 * s, height: 10 * s, borderRadius: 999, background: `linear-gradient(90deg, ${C.left}, ${C.neutral}, ${C.right})` }} />
        <div style={{ display: "flex" }}>de « plutôt à gauche » à « plutôt à droite » sur chaque sujet</div>
      </div>
    </div>
  );

  const head = (
    <div style={{ ...st.col, gap: 12 * s }}>
      <Eyebrow f={f}>{party.family}</Eyebrow>
      <div style={{ ...st.row, gap: 20 * s, alignItems: "flex-start" }}>
        <div style={{ display: "flex", paddingTop: 20 * s }}>
          <Dot color={party.color} size={Math.round(40 * s)} />
        </div>
        <div style={{ display: "flex", fontSize: (story ? 72 : party.name.length > 24 ? 54 : 60) * s, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05 }}>{party.name}</div>
      </div>
      <div style={{ ...st.row, gap: 16 * s, flexWrap: "wrap" }}>
        <div style={{ display: "flex", fontSize: 26 * s, color: C.ink2, fontWeight: 600 }}>Dire et faire, dans l&apos;ensemble :</div>
        <Pill f={f} tone={gw.tone}>
          {gw.label}
        </Pill>
      </div>
    </div>
  );

  const el = og ? (
    <Frame f={f} host={host} color={party.color} kind="Ses positions">
      <div style={{ ...st.row, gap: 40, alignItems: "flex-start" }}>
        <div style={{ ...st.col, gap: 14, width: 340 }}>
          <div style={{ display: "flex", fontSize: 48 * s, fontWeight: 800, letterSpacing: -1, lineHeight: 1.05 }}>{party.name}</div>
          <Pill f={f} tone={gw.tone}>
            {gw.label}
          </Pill>
          <div style={{ display: "flex", marginTop: 10 }}>
            <StanceLegend f={f} size={0.9} />
          </div>
        </div>
        <div style={{ ...st.col, flex: 1, gap: 12 }}>{rows.map(rowEl)}</div>
      </div>
    </Frame>
  ) : (
    <Frame f={f} host={host} color={party.color} kind="Ses positions" center>
      <div style={{ ...st.col, gap: (story ? 32 : 20) * s }}>
        {head}
        {legend}
        <div style={{ ...st.col, gap: (story ? 10 : 8) * s, background: C.surface, border: `2px solid ${C.border}`, borderRadius: 32 * s, padding: `${(story ? 26 : 20) * s}px ${30 * s}px` }}>{rows.map(rowEl)}</div>
      </div>
    </Frame>
  );
  return renderImage(el, f, { filename: `coherence-${party.id}`, trusted });
}
