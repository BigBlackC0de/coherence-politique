import type { NextRequest } from "next/server";
import type { ReactNode } from "react";
import { getParty, themeDetail } from "@/lib/queries";
import { scrutinSummaries } from "@/lib/queries-share";
import { THEME_BY_ID } from "@/lib/config/themes";
import { VERDICT_PLAIN, gapWords, stanceWords, themePlain } from "@/lib/config/plain";
import type { EvidenceItem } from "@/lib/db/schema";
import { C, Frame, Eyebrow, Pill, StanceBar, Ring, Dot, POSITION, TONE, st, clip, nb, upperFirst, fmtDate, parseFormat, siteHost, validId, notFoundImage, badFormat, renderImage } from "@/lib/share/render";

export const dynamic = "force-dynamic";

/** Image « un parti × un sujet » : ce qu'il dit, ce qu'il vote, le verdict et deux votes qui le montrent. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; sujet: string }> }) {
  const { id, sujet } = await ctx.params;
  const f = parseFormat(req);
  if (!f) return badFormat();
  const theme = THEME_BY_ID[sujet];
  if (!validId(id) || !theme) return notFoundImage();
  const party = getParty(id);
  if (!party) return notFoundImage();
  const sc = themeDetail(sujet).parties.find((p) => p.id === id);
  const { host, trusted } = siteHost(req);
  const pl = themePlain(sujet);
  const dw = stanceWords(sujet, sc?.declaredStance);
  const vw = stanceWords(sujet, sc?.votedStance);
  const verdict = sc?.verdict ? VERDICT_PLAIN[sc.verdict] : null;
  const gw = gapWords(sc?.gap);
  const verdictLabel = verdict?.label ?? (sc?.gap != null ? gw.label : "pas encore analysé");
  const verdictTone = verdict?.tone ?? gw.tone;

  // Deux votes « preuves » : les plus importants, puis les plus récents, sans doublon d'intitulé.
  let evidence: EvidenceItem[] = [];
  try {
    const raw = sc?.evidence as unknown;
    evidence = typeof raw === "string" ? (JSON.parse(raw) as EvidenceItem[]) : Array.isArray(raw) ? (raw as EvidenceItem[]) : [];
  } catch {
    evidence = [];
  }
  const seen = new Set<string>();
  const picked = [...evidence]
    .filter((e) => e && POSITION[e.position])
    .sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0) || (b.date ?? "").localeCompare(a.date ?? ""))
    .filter((e) => {
      const k = e.title.slice(0, 60);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 2);
  const sums = scrutinSummaries(picked.map((e) => e.scrutinUid));

  const s = f.s;
  const og = f.id === "og";
  const story = f.id === "story";
  const sq = f.id === "carre";
  const barW = og ? 560 : f.w - 2 * f.pad - 2 * 36 * s;
  const voteN = sc?.votedN ?? 0;

  const line = (icon: ReactNode, label: string, text: string) => (
    <div style={{ ...st.row, gap: 22 * s, alignItems: "flex-start" }}>
      <div style={{ display: "flex", width: 44 * s, justifyContent: "center", paddingTop: 8 * s }}>{icon}</div>
      <div style={{ ...st.col, flex: 1 }}>
        <div style={{ display: "flex", fontSize: 24 * s, color: C.ink3, fontWeight: 600 }}>{label}</div>
        <div style={{ display: "flex", fontSize: (sq ? 33 : og ? 30 : 36) * s, fontWeight: 800, lineHeight: 1.2 }}>{nb(text)}</div>
      </div>
    </div>
  );

  const positionsCard = (
    <div style={{ ...st.col, background: C.surface, border: `2px solid ${C.border}`, borderRadius: 32 * s, padding: `${(sq ? 26 : 32) * s}px ${36 * s}px`, gap: (sq ? 18 : 26) * s, ...(og ? { width: barW + 72 * s } : {}) }}>
      {line(<Ring size={Math.round(30 * s)} border={Math.max(4, Math.round(6 * s))} />, "Ce qu'il dit (programme)", dw ? upperFirst(dw.text) : "Pas de programme analysé")}
      {line(<Dot color={C.ink} size={Math.round(26 * s)} />, `Ce qu'il vote${voteN ? ` (${voteN} votes)` : ""}`, vw ? upperFirst(vw.text) : "Pas de vote sur ce sujet")}
      <div style={{ ...st.col, gap: 10 * s, marginTop: 6 * s }}>
        <StanceBar declared={sc?.declaredStance} voted={sc?.votedStance} width={barW} height={Math.round(20 * s)} />
        <div style={{ ...st.row, justifyContent: "space-between", fontSize: 22 * s, fontWeight: 600, width: barW }}>
          <div style={{ display: "flex", color: C.left }}>← {pl.left}</div>
          <div style={{ display: "flex", color: C.right }}>{pl.right} →</div>
        </div>
      </div>
    </div>
  );

  const votes = picked.length > 0 && (
    <div style={{ ...st.col, gap: (sq ? 14 : 18) * s }}>
      <div style={{ display: "flex", fontSize: 24 * s, color: C.ink3, fontWeight: 600 }}>Deux votes qui le montrent</div>
      {picked.map((e) => {
        const p = POSITION[e.position];
        const t = TONE[p.tone];
        return (
          <div key={e.scrutinUid} style={{ ...st.row, gap: 20 * s, alignItems: "flex-start" }}>
            <div style={{ display: "flex", width: 150 * s, justifyContent: "center", fontSize: 24 * s, fontWeight: 800, color: t.fg, background: t.bg, border: `2px solid ${t.border}`, borderRadius: 14 * s, padding: `${6 * s}px 0` }}>{p.label}</div>
            <div style={{ ...st.col, flex: 1 }}>
              <div style={{ display: "block", fontSize: (sq ? 25 : 27) * s, lineHeight: 1.25, fontWeight: 600, lineClamp: story ? 4 : 2 }}>{nb(upperFirst(clip(sums[e.scrutinUid]?.summary ?? e.title, story ? 200 : 130)))}</div>
              <div style={{ display: "flex", fontSize: 21 * s, color: C.ink3, marginTop: 4 * s }}>
                {fmtDate(e.date)} · {sums[e.scrutinUid]?.chamber === "SENAT" ? "Sénat" : "Assemblée nationale"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const head = (
    <div style={{ ...st.col, gap: 14 * s }}>
      <Eyebrow f={f}>Sur le sujet : {theme.label}</Eyebrow>
      <div style={{ ...st.row, gap: 20 * s, alignItems: "flex-start" }}>
        <div style={{ display: "flex", paddingTop: 22 * s }}>
          <Dot color={party.color} size={Math.round(40 * s)} />
        </div>
        <div style={{ display: "flex", fontSize: (party.name.length > 24 ? 60 : sq ? 66 : 72) * s, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05 }}>{party.name}</div>
      </div>
      {story && <div style={{ display: "flex", fontSize: 28 * s, color: C.ink2, lineHeight: 1.3 }}>{nb(pl.question)}</div>}
    </div>
  );

  const verdictBlock = (
    <div style={{ ...st.row, gap: 18 * s, flexWrap: "wrap" }}>
      <div style={{ display: "flex", fontSize: 26 * s, color: C.ink2, fontWeight: 600 }}>Le verdict :</div>
      <Pill f={f} tone={verdictTone} size={1.15}>
        {verdictLabel}
      </Pill>
    </div>
  );

  const el = og ? (
    <Frame f={f} host={host} color={party.color} kind="Dire et faire" center>
      <div style={{ ...st.row, gap: 40, alignItems: "flex-start" }}>
        <div style={{ ...st.col, gap: 22, flex: 1 }}>
          {head}
          {verdictBlock}
        </div>
        {positionsCard}
      </div>
    </Frame>
  ) : (
    <Frame f={f} host={host} color={party.color} kind="Dire et faire" center={story}>
      <div style={{ ...st.col, gap: (story ? 56 : 22) * s }}>
        {head}
        {positionsCard}
        {verdictBlock}
        {votes}
      </div>
    </Frame>
  );
  return renderImage(el, f, { filename: `coherence-${party.id}-${sujet}`, trusted });
}
