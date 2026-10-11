import type { NextRequest } from "next/server";
import { getParty } from "@/lib/queries";
import { alignmentFor, stancesOf } from "@/lib/queries-ecarts";
import { THEME_BY_ID } from "@/lib/config/themes";
import { SOURCE_LABEL, ecartHeadline, ecartTag, themePlain, type AlignSource } from "@/lib/config/plain";
import { alignLayout, missingText } from "@/components/alignment";
import { C, Frame, Eyebrow, Pill, Dot, st, nb, parseFormat, siteHost, validId, notFoundImage, badFormat, renderImage } from "@/lib/share/render";

export const dynamic = "force-dynamic";

const SOURCES: AlignSource[] = ["programme", "votes", "discours"];
/** Couleurs des sources, valeurs claires de --src-* (globals.css) : l'image est toujours sur fond clair. */
const SRC_COLOR: Record<AlignSource, string> = { programme: "#4a3aa7", votes: "#1baf7a", discours: "#eb6834" };

/** Image « écart » : programme, votes et discours d'un parti sur un sujet, sur trois rails. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; sujet: string }> }) {
  const { id, sujet } = await ctx.params;
  const f = parseFormat(req);
  if (!f) return badFormat();
  const theme = THEME_BY_ID[sujet];
  if (!validId(id) || !theme) return notFoundImage();
  const party = getParty(id);
  const a = alignmentFor(id, sujet);
  if (!party || !a) return notFoundImage();
  const { host, trusted } = siteHost(req);
  const pl = themePlain(sujet);
  const s = f.s;
  const og = f.id === "og";
  const story = f.id === "story";

  // Même langage que le site (components/alignment.tsx) : échelle neutre, points colorés étiquetés, trait d'écart.
  const railW = Math.round(og ? 700 : f.w - 2 * f.pad - 2 * 34 * s);
  const { pts, clusters } = alignLayout(a);
  const up = clusters.filter((c) => c.lane === "up");
  const down = clusters.filter((c) => c.lane === "down");
  const dot = Math.round(30 * s);
  const laneH = Math.round(44 * s);
  const trackH = Math.round(44 * s);
  const px = (x: number) => (x / 100) * railW;
  const lo = pts.length >= 2 ? px(pts[0].x) : null;
  const hi = pts.length >= 2 ? px(pts[pts.length - 1].x) : null;
  const labelLane = (list: typeof clusters) => (
    <div style={{ display: "flex", position: "relative", width: railW, height: laneH }}>
      {list.map((c) => {
        const w = Math.round(c.srcs.reduce((t, k) => t + SOURCE_LABEL[k].length * 17 + 34, 0) * s);
        const left = Math.max(0, Math.min(railW - w, px(c.x) - w / 2));
        return (
          <div key={c.srcs.join()} style={{ ...st.row, position: "absolute", left, width: w, top: 0, height: laneH, justifyContent: c.x < 14 ? "flex-start" : c.x > 86 ? "flex-end" : "center", gap: 16 * s }}>
            {c.srcs.map((k) => (
              <div key={k} style={{ ...st.row, gap: 8 * s, fontSize: 27 * s, fontWeight: 700, color: C.ink2 }}>
                <Dot color={SRC_COLOR[k]} size={Math.round(14 * s)} />
                {SOURCE_LABEL[k]}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
  const missing = SOURCES.filter((k) => !a[k].ok);

  const rails = (
    <div style={{ ...st.col, background: C.surface, border: `${Math.round(2 * s)}px solid ${C.border}`, borderRadius: 32 * s, padding: `${26 * s}px ${34 * s}px`, gap: 6 * s }}>
      {up.length > 0 && labelLane(up)}
      <div style={{ display: "flex", position: "relative", width: railW, height: trackH }}>
        <div style={{ display: "flex", position: "absolute", left: 0, top: trackH / 2 - 2 * s, width: railW, height: 4 * s, borderRadius: 999, background: C.border2 }} />
        <div style={{ display: "flex", position: "absolute", left: railW / 2 - 1, top: 4 * s, width: 2, height: trackH - 8 * s, background: C.ink3 }} />
        {lo !== null && hi !== null && (
          <div style={{ display: "flex", position: "absolute", left: lo, top: trackH / 2 - (a.alert ? 3 : 2) * s, width: hi - lo, height: (a.alert ? 6 : 4) * s, borderRadius: 999, background: a.alert ? C.ink : C.ink3 }} />
        )}
        {pts.map((p) => (
          <div key={p.src} style={{ display: "flex", position: "absolute", left: px(p.x) - dot / 2 - 4 * s, top: trackH / 2 - dot / 2 - 4 * s, width: dot + 8 * s, height: dot + 8 * s, borderRadius: 999, background: C.surface, alignItems: "center", justifyContent: "center" }}>
            <Dot color={SRC_COLOR[p.src]} size={dot} />
          </div>
        ))}
      </div>
      {down.length > 0 && labelLane(down)}
      <div style={{ ...st.row, justifyContent: "space-between", fontSize: 22 * s, fontWeight: 600, color: C.ink3, marginTop: 6 * s }}>
        <div style={{ display: "flex" }}>← {pl.left}</div>
        <div style={{ display: "flex" }}>{pl.right} →</div>
      </div>
      {missing.map((k) => (
        <div key={k} style={{ display: "flex", fontSize: 20 * s, color: C.ink3, marginTop: 4 * s }}>
          {nb(`${SOURCE_LABEL[k]} : ${missingText(k, a)}`)}
        </div>
      ))}
    </div>
  );

  const text = a.alert ? `${party.shortName} : ${ecartHeadline(sujet, stancesOf(a)).replace(/^./, (c) => c.toLowerCase())}` : "Pas d'écart signalé pour l'instant : les repères fiables restent proches, ou il en manque.";
  const head = (
    <div style={{ ...st.col, gap: 14 * s }}>
      <Eyebrow f={f}>Sur le sujet : {theme.label}</Eyebrow>
      <div style={{ ...st.row, gap: 18 * s }}>
        <Dot color={party.color} size={Math.round(38 * s)} />
        <div
          style={{
            display: "flex",
            fontSize: (og ? 60 : 68) * s,
            fontWeight: 800,
            letterSpacing: -1.5,
            lineHeight: 1.05,
          }}
        >
          {party.shortName}
        </div>
      </div>
      {a.alert && (
        <Pill f={f} tone="warn" size={og ? 0.9 : 1}>
          {ecartTag(a.pair)}
        </Pill>
      )}
    </div>
  );
  const sentence = (
    <div
      style={{
        display: "flex",
        fontSize: (og ? 26 : story ? 36 : 31) * s,
        fontWeight: 600,
        lineHeight: 1.3,
      }}
    >
      {nb(text)}
    </div>
  );
  const foot = (
    <div
      style={{
        display: "flex",
        fontSize: 21 * s,
        color: C.ink3,
        lineHeight: 1.35,
      }}
    >
      {nb("Un écart peut avoir des raisons (opposition, compromis, actualité). Les citations et les votes sont sur le site.")}
    </div>
  );

  const el = og ? (
    <Frame f={f} host={host} color={party.color} kind="Dire et faire" center>
      <div style={{ ...st.row, gap: 36, alignItems: "center" }}>
        <div style={{ ...st.col, gap: 18, width: 330 }}>{head}</div>
        <div style={{ ...st.col, gap: 14, flex: 1 }}>
          {rails}
          {sentence}
        </div>
      </div>
    </Frame>
  ) : (
    <Frame f={f} host={host} color={party.color} kind="Dire et faire" center={story}>
      <div style={{ ...st.col, gap: (story ? 48 : 24) * s }}>
        {head}
        {rails}
        {sentence}
        {foot}
      </div>
    </Frame>
  );
  return renderImage(el, f, {
    filename: `coherence-ecart-${party.id}-${sujet}`,
    trusted,
  });
}
