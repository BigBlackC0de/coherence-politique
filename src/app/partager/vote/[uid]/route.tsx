import type { NextRequest } from "next/server";
import { allParties, scrutinDetail } from "@/lib/queries";
import { scrutinDebate } from "@/lib/queries-debates";
import { C, Frame, Eyebrow, Dot, POSITION, TONE, st, clip, nb, upperFirst, fmtDate, fmtInt, parseFormat, siteHost, validId, notFoundImage, badFormat, renderImage, type Fmt } from "@/lib/share/render";

export const dynamic = "force-dynamic";

type Chip = { key: string; name: string; color: string };

/** Image « un vote » : de quoi il s'agit, le résultat, et qui a voté quoi (par groupe / parti). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  const { uid } = await ctx.params;
  const f = parseFormat(req);
  if (!f) return badFormat();
  if (!validId(uid)) return notFoundImage();
  const d = scrutinDetail(uid);
  if (!d) return notFoundImage();
  const { scrutin, analysis, groups } = d;
  const { host, trusted } = siteHost(req);
  const s = f.s;
  const og = f.id === "og";
  const story = f.id === "story";
  const sq = f.id === "carre";

  const short = Object.fromEntries(allParties().map((p) => [p.id, p.shortName]));
  const byPos: Record<"pour" | "contre" | "abstention", Chip[]> = { pour: [], contre: [], abstention: [] };
  for (const g of groups) {
    if (!g.position || !(g.position in byPos) || g.pour + g.contre + g.abstentions === 0) continue;
    const name = (g.partyId && short[g.partyId]) || g.groupAbbrev || "?";
    const list = byPos[g.position as keyof typeof byPos];
    if (list.some((c) => c.name === name)) continue;
    list.push({ key: g.groupRef, name, color: g.color ?? C.neutral });
  }

  const adopted = /adopt/i.test(scrutin.sort ?? "");
  const rejected = /rejet/i.test(scrutin.sort ?? "");
  const resultTone = adopted ? TONE.good : rejected ? TONE.bad : TONE.muted;
  const pour = scrutin.pour ?? 0;
  const contre = scrutin.contre ?? 0;
  const abst = scrutin.abstentions ?? 0;
  const total = Math.max(1, pour + contre + abst);
  const chamber = scrutin.chamber === "SENAT" ? "au Sénat" : "à l'Assemblée";

  const ex = scrutinDebate(uid)?.explanation ?? null;
  const title = ex?.titre ? upperFirst(ex.titre) : analysis?.summary ? upperFirst(analysis.summary) : upperFirst(scrutin.title);
  const stakes = ex?.enjeu ?? analysis?.stakes ?? null;
  const titleMax = story ? 230 : sq ? 190 : 120;
  const titleSize = (sq ? (title.length > 110 ? 42 : 48) : title.length > 160 ? 44 : title.length > 110 ? 50 : 58) * s * (og ? 0.95 : 1);

  const result = (
    <div style={{ ...st.col, gap: 16 * s }}>
      <div style={{ ...st.row, gap: 22 * s }}>
        {scrutin.sort && <div style={{ display: "flex", fontSize: 40 * s, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: resultTone.fg, background: resultTone.bg, border: `3px solid ${resultTone.border}`, borderRadius: 18 * s, padding: `${6 * s}px ${24 * s}px` }}>{scrutin.sort}</div>}
        <div style={{ ...st.row, gap: 18 * s, fontSize: 27 * s, fontWeight: 600, color: C.ink2 }}>
          <div style={{ display: "flex", color: TONE.good.fg }}>{fmtInt(pour)} pour</div>
          <div style={{ display: "flex", color: TONE.bad.fg }}>{fmtInt(contre)} contre</div>
          <div style={{ display: "flex", color: TONE.warn.fg }}>{fmtInt(abst)} abst.</div>
        </div>
      </div>
      <div style={{ display: "flex", width: "100%", height: 22 * s, borderRadius: 999, overflow: "hidden", background: C.surface2 }}>
        <div style={{ display: "flex", width: `${(pour / total) * 100}%`, background: C.good }} />
        <div style={{ display: "flex", width: `${(contre / total) * 100}%`, background: C.bad }} />
        <div style={{ display: "flex", width: `${(abst / total) * 100}%`, background: C.warn }} />
      </div>
    </div>
  );

  const who = <Who f={f} byPos={byPos} />;

  const head = (
    <div style={{ ...st.col, gap: 16 * s }}>
      <Eyebrow f={f}>
        Vote {chamber} · {fmtDate(scrutin.date)}
      </Eyebrow>
      <div style={{ display: "block", fontSize: titleSize, fontWeight: 800, letterSpacing: -1, lineHeight: 1.12, lineClamp: story ? 6 : 4 }}>{nb(clip(title, titleMax))}</div>
      {stakes && !og && <div style={{ display: "block", fontSize: (sq ? 25 : 28) * s, color: C.ink2, lineHeight: 1.3, lineClamp: story ? 4 : 2 }}>{nb(clip(stakes, story ? 260 : 140))}</div>}
    </div>
  );

  const el = og ? (
    <Frame f={f} host={host} kind="Un vote" center>
      <div style={{ ...st.row, gap: 40, alignItems: "center" }}>
        <div style={{ ...st.col, gap: 24, width: 560 }}>
          {head}
          {result}
        </div>
        <div style={{ display: "flex", flex: 1 }}>{who}</div>
      </div>
    </Frame>
  ) : (
    <Frame f={f} host={host} kind="Un vote" center>
      <div style={{ ...st.col, gap: (story ? 52 : 22) * s }}>
        {head}
        {result}
        {who}
      </div>
    </Frame>
  );
  return renderImage(el, f, { filename: `coherence-vote-${uid}`, trusted });
}

/** Qui a voté quoi : une ligne par position, des pastilles aux couleurs des partis. */
function Who({ f, byPos }: { f: Fmt; byPos: Record<"pour" | "contre" | "abstention", Chip[]> }) {
  const s = f.s;
  const og = f.id === "og";
  const sq = f.id === "carre";
  const chip = (sq ? 23 : 25) * s;
  const lines = (["pour", "contre", "abstention"] as const).filter((k) => byPos[k].length > 0);
  if (!lines.length) return <div style={{ display: "flex", fontSize: 24 * s, color: C.ink3 }}>Pas de détail par groupe pour ce vote.</div>;
  return (
    <div style={{ ...st.col, gap: (og || sq ? 12 : 18) * s, background: C.surface, border: `2px solid ${C.border}`, borderRadius: 28 * s, padding: `${(sq ? 18 : 24) * s}px ${28 * s}px`, ...(og ? { flex: 1 } : {}) }}>
      <div style={{ display: "flex", fontSize: 24 * s, color: C.ink3, fontWeight: 600 }}>Qui a voté quoi (majorité de chaque groupe)</div>
      {lines.map((k) => {
        const p = POSITION[k];
        const t = TONE[p.tone];
        return (
          <div key={k} style={{ ...st.row, gap: 18 * s, alignItems: "flex-start" }}>
            <div style={{ display: "flex", width: 170 * s, flexShrink: 0, justifyContent: "center", fontSize: chip, fontWeight: 800, color: t.fg, background: t.bg, border: `2px solid ${t.border}`, borderRadius: 14 * s, padding: `${6 * s}px 0` }}>{p.label}</div>
            <div style={{ ...st.row, flexWrap: "wrap", gap: 10 * s, flex: 1 }}>
              {byPos[k].map((c) => (
                <div key={c.key} style={{ ...st.row, gap: 8 * s, fontSize: chip, fontWeight: 700, background: C.surface2, borderRadius: 999, padding: `${6 * s}px ${16 * s}px ${6 * s}px ${12 * s}px` }}>
                  <Dot color={c.color} size={Math.round(18 * s)} />
                  {c.name}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
