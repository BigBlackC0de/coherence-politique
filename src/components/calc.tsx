import { themePlain } from "@/lib/config/plain";
import { majorityPosition } from "@/lib/ingest/group-position";
import type { VoteKind } from "@/lib/analysis/vote-kind";

/**
 * Affichage du calcul, ligne par ligne : mêmes règles que `analysis/scores.ts` et `queries-ecarts.ts`.
 *   points = pos × sens      (pos : pour +1, contre −1, abstention 0 ; sens : direction d'un vote POUR)
 *   poids  = part du sujet × importance
 *   contribution = points × poids
 *   position = Σ contributions ÷ Σ poids
 */
export const POS_POINTS: Record<string, number> = { pour: 1, contre: -1, abstention: 0 };
export const POS_LABEL: Record<string, string> = { pour: "pour", contre: "contre", abstention: "abstention" };
export const KIND_LABEL: Record<VoteKind, string> = {
  detail: "vote sur un point précis (amendement ou article)",
  global: "vote sur un texte entier ou une motion",
  autre: "autre vote",
};

export const signed = (v: number, d = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
export const dec = (v: number, d = 2) => v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: d });

/** « 60 contre, 0 pour, 0 abst. → contre » : comment la position du groupe est obtenue. */
export function GroupRule({ pour, contre, abstentions }: { pour: number; contre: number; abstentions: number }) {
  const p = majorityPosition(pour, contre, abstentions);
  return (
    <span>
      {pour} pour · {contre} contre · {abstentions} abst. →{" "}
      {p ? <strong className="text-ink">{POS_LABEL[p]}</strong> : <strong className="text-ink-3">{pour + contre + abstentions === 0 ? "absent" : "égalité"}, ne compte pas</strong>}
    </span>
  );
}

/** « contre (−1) × sens du pour (−1) = +1 ; poids 0,6 × 4 = 2,4 → +2,4 vers « … » ». */
export function VoteCalc({ themeId, position, direction, weight, salience }: { themeId: string; position: string; direction: number; weight: number; salience: number }) {
  const pl = themePlain(themeId);
  const pos = POS_POINTS[position] ?? 0;
  const pts = pos * direction;
  const w = weight * salience;
  const toward = pts < 0 ? pl.left : pts > 0 ? pl.right : null;
  return (
    <span className="num">
      {POS_LABEL[position] ?? position} ({signed(pos, 0)}) × sens du pour ({signed(direction, 0)}) = <strong className="text-ink">{signed(pts, 0)}</strong> ; poids {dec(weight)} × importance {salience} ={" "}
      {dec(w)} → <strong className={pts < 0 ? "text-left" : pts > 0 ? "text-right" : "text-ink-3"}>{signed(pts * w)}</strong>
      {toward ? <> vers « {toward} »</> : <> (l&apos;abstention tire vers le milieu)</>}
    </span>
  );
}
