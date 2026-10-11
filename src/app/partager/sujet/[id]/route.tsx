import type { NextRequest } from "next/server";
import { themeDetail } from "@/lib/queries";
import { THEME_BY_ID } from "@/lib/config/themes";
import { themePlain } from "@/lib/config/plain";
import { C, Frame, Eyebrow, StanceBar, StanceLegend, Dot, st, nb, parseFormat, siteHost, notFoundImage, badFormat, renderImage } from "@/lib/share/render";

export const dynamic = "force-dynamic";

/** Image « un sujet » : où se placent les partis, programme (anneau) et votes (disque). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const f = parseFormat(req);
  if (!f) return badFormat();
  const theme = THEME_BY_ID[id];
  if (!theme) return notFoundImage();
  const { parties } = themeDetail(id);
  const pl = themePlain(id);
  const { host, trusted } = siteHost(req);
  const s = f.s;
  const og = f.id === "og";
  const story = f.id === "story";

  const contentW = f.w - 2 * f.pad;
  const labelW = Math.round((og ? 120 : 150) * s);
  const innerW = (og ? contentW - 380 - 40 : contentW) - 2 * 30 * s - 4;
  const barW = Math.round(innerW - labelW - 16 * s - 16);

  const rows = parties.map((p) => (
    <div key={p.id} style={{ ...st.row, gap: 16 * s }}>
      <div style={{ ...st.row, width: labelW, gap: 10 * s }}>
        <Dot color={p.color} size={Math.round(18 * s)} />
        <div style={{ display: "flex", fontSize: (story ? 27 : 24) * s, fontWeight: 800 }}>{p.short_name}</div>
      </div>
      {p.declaredStance !== null || p.votedStance !== null ? (
        <StanceBar declared={p.declaredStance} voted={p.votedStance} width={barW} height={Math.round((story ? 15 : 12) * s)} />
      ) : (
        <div style={{ display: "flex", fontSize: 21 * s, color: C.ink3 }}>pas encore de données</div>
      )}
    </div>
  ));

  const poles = (
    <div style={{ ...st.row, justifyContent: "space-between", fontSize: (og ? 20 : 23) * s, fontWeight: 700, paddingLeft: labelW + 16 * s, gap: 20 }}>
      <div style={{ display: "flex", color: C.left }}>← {pl.left}</div>
      <div style={{ display: "flex", color: C.right }}>{pl.right} →</div>
    </div>
  );

  const card = (
    <div style={{ ...st.col, gap: (story ? 22 : og ? 9 : 12) * s, background: C.surface, border: `2px solid ${C.border}`, borderRadius: 32 * s, padding: `${(story ? 30 : 22) * s}px ${30 * s}px`, ...(og ? { flex: 1 } : {}) }}>
      {poles}
      {rows}
    </div>
  );

  const head = (
    <div style={{ ...st.col, gap: 14 * s }}>
      <Eyebrow f={f}>Sujet</Eyebrow>
      <div style={{ display: "flex", fontSize: (og ? 56 : 68) * s, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05 }}>{theme.label}</div>
      <div style={{ display: "flex", fontSize: (og ? 24 : 29) * s, color: C.ink2, lineHeight: 1.3 }}>{nb(pl.question)}</div>
    </div>
  );

  const el = og ? (
    <Frame f={f} host={host} kind="Où sont les partis ?" center>
      <div style={{ ...st.row, gap: 40, alignItems: "center" }}>
        <div style={{ ...st.col, gap: 20, width: 380 }}>
          {head}
          <StanceLegend f={f} size={0.85} />
        </div>
        {card}
      </div>
    </Frame>
  ) : (
    <Frame f={f} host={host} kind="Où sont les partis ?" center>
      <div style={{ ...st.col, gap: (story ? 40 : 22) * s }}>
        {head}
        <StanceLegend f={f} />
        {card}
        {story && <div style={{ display: "flex", fontSize: 24 * s, color: C.ink3, lineHeight: 1.35 }}>{nb(`Dans ce sujet : ${pl.examples}.`)}</div>}
      </div>
    </Frame>
  );
  return renderImage(el, f, { filename: `coherence-sujet-${id}`, trusted });
}
