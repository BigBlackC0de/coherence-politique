import type { NextRequest } from "next/server";
import { politicianDetail } from "@/lib/queries";
import { memberParticipation } from "@/lib/analysis/participation";
import { C, Frame, Eyebrow, Dot, st, nb, fmtDate, fmtInt, fmtPct, parseFormat, siteHost, validId, notFoundImage, badFormat, renderImage } from "@/lib/share/render";

export const dynamic = "force-dynamic";

/** Image « un élu » : présence aux votes, votes contre son groupe, nombre de votes. Pas de photo : initiales. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const f = parseFormat(req);
  if (!f) return badFormat();
  if (!validId(id)) return notFoundImage();
  const d = politicianDetail(id);
  if (!d) return notFoundImage();
  const { politician: p, party, stats } = d;
  const chamber = p.chamber === "SENAT" ? "SENAT" : "AN";
  const part = memberParticipation(chamber).find((m) => m.id === p.id) ?? null;
  const { host, trusted } = siteHost(req);
  const s = f.s;
  const og = f.id === "og";
  const story = f.id === "story";
  const color = party?.color ?? C.neutral;

  const presence = part ? (chamber === "AN" ? part.presenceRate : part.voteRate) : null;
  const dissent = stats.compared ? stats.dissent / stats.compared : null;
  const role = chamber === "AN" ? "Député·e" : "Sénateur·rice";
  const place = [p.department, p.circo ? `${p.circo}e circonscription` : null].filter(Boolean).join(", ");
  const initials = `${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`.toUpperCase();

  const tiles = [
    {
      label: chamber === "AN" ? "Présent aux votes" : "A pris part aux votes",
      value: presence === null ? "—" : fmtPct(presence),
      hint: part?.since ? `scrutins publics depuis le ${fmtDate(part.since)}` : "scrutins publics",
    },
    {
      label: "Vote autrement que son groupe",
      value: dissent === null ? "—" : fmtPct(dissent, 1),
      hint: dissent === null ? "pas assez de votes comparables" : dissent < 0.02 ? "très discipliné·e" : dissent < 0.08 ? "quelques écarts" : "souvent indépendant·e",
    },
    { label: "Votes enregistrés", value: fmtInt(stats.total), hint: "depuis le début de la législature" },
  ];

  const tileEl = (t: (typeof tiles)[number]) => (
    <div key={t.label} style={{ ...st.col, ...(story ? {} : { flex: 1 }), gap: 6 * s, background: C.surface, border: `2px solid ${C.border}`, borderRadius: 28 * s, padding: `${(story ? 24 : 22) * s}px ${(story ? 34 : 24) * s}px` }}>
      <div style={{ display: "flex", fontSize: (story ? 27 : og ? 24 : 23) * s, color: C.ink2, fontWeight: 600, lineHeight: 1.2 }}>{t.label}</div>
      <div style={{ display: "flex", fontSize: (story ? 84 : og ? 66 : 64) * s, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>{nb(t.value)}</div>
      <div style={{ display: "flex", fontSize: (story ? 23 : 20) * s, color: C.ink3, lineHeight: 1.25 }}>{t.hint}</div>
    </div>
  );

  const avatar = Math.round((story ? 150 : og ? 130 : 140) * s);
  const head = (
    <div style={{ ...(story ? st.col : st.row), gap: (story ? 34 : 30) * s, alignItems: story ? "flex-start" : "center" }}>
      <div style={{ display: "flex", width: avatar, height: avatar, borderRadius: avatar * 0.28, background: color, color: "#fff", alignItems: "center", justifyContent: "center", fontSize: avatar * 0.4, fontWeight: 800, flexShrink: 0 }}>{initials}</div>
      <div style={{ ...st.col, gap: 10 * s, ...(story ? {} : { flex: 1 }) }}>
        <Eyebrow f={f}>{role}</Eyebrow>
        <div style={{ display: "flex", fontSize: (p.fullName.length > 22 ? 58 : 68) * s, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05 }}>{p.fullName}</div>
        <div style={{ ...st.row, gap: 14 * s, flexWrap: "wrap", fontSize: 26 * s, color: C.ink2 }}>
          {party && (
            <div style={{ ...st.row, gap: 10 * s, fontWeight: 700, color: C.ink, background: C.surface, border: `2px solid ${C.border}`, borderRadius: 999, padding: `${4 * s}px ${16 * s}px ${4 * s}px ${12 * s}px` }}>
              <Dot color={party.color} size={Math.round(18 * s)} />
              {party.name}
            </div>
          )}
          <div style={{ display: "flex" }}>{[p.groupAbbrev ? `groupe ${p.groupAbbrev}` : null, place || null].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
    </div>
  );

  const note = <div style={{ display: "flex", fontSize: (story ? 23 : 20) * s, color: C.ink3, lineHeight: 1.35 }}>{nb("Seuls les scrutins publics sont comptés : ce n'est pas une mesure du travail en commission ou en circonscription.")}</div>;

  const el = (
    <Frame f={f} host={host} color={color} kind="Un élu au travail" center>
      <div style={{ ...st.col, gap: (story ? 44 : og ? 26 : 34) * s }}>
        {head}
        <div style={{ ...(story ? st.col : st.row), gap: (story ? 22 : 18) * s }}>{tiles.map(tileEl)}</div>
        {!og && note}
      </div>
    </Frame>
  );
  return renderImage(el, f, { filename: `coherence-elu-${p.id}`, trusted });
}
