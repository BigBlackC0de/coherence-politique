import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { ECART_CAVEAT, SOURCE_LABEL, ecartBadge, ecartHeadline, ecartTag, stanceWords, themePlain, type AlignSource } from "@/lib/config/plain";
import { ALERT_GAP, DISCOURS_MIN_POSTS, DISCOURS_MIN_SPEAKERS, VOTES_MIN_N } from "@/lib/config/thresholds";
import type { Alignment } from "@/lib/queries-ecarts";

/**
 * Programme / Votes / Discours d'un parti sur un sujet : un graphique « haltère » (dumbbell).
 * Une seule échelle neutre (pas de dégradé) ; un point par source, étiqueté en toutes lettres
 * juste au-dessus ou au-dessous (l'identité ne repose jamais sur la couleur seule) ; un trait fin
 * relie les extrêmes, et ne devient franc qu'en cas d'écart. Couleurs : jetons --src-* de globals.css
 * (palette catégorielle validée en clair et en sombre). Composants serveur.
 */

export type AlignData = Pick<Alignment, "programme" | "votes" | "discours" | "spread" | "pair" | "alert">;
const SOURCES: AlignSource[] = ["programme", "votes", "discours"];
const DOT: Record<AlignSource, string> = { programme: "bg-src-programme", votes: "bg-src-votes", discours: "bg-src-discours" };
const SOURCE_HINT: Record<AlignSource, string> = { programme: "ce qu'il écrit", votes: "ce que votent ses députés", discours: "ce que disent ses élus" };

/** Pastille de couleur d'une source (avec un liseré du fond pour rester lisible quand deux points se touchent). */
export function Marker({ src, size = 12, className = "" }: { src: AlignSource; size?: number; className?: string }) {
  return <span className={`inline-block shrink-0 rounded-full ${DOT[src]} ${className}`} style={{ width: size, height: size, boxShadow: "0 0 0 2px var(--surface)" }} aria-hidden />;
}

/** Pourquoi un repère n'est pas affiché. */
export function missingText(src: AlignSource, a: AlignData): string {
  if (src === "programme") return a.programme.n === 0 ? "pas de programme lu sur ce sujet" : "le programme en parle trop peu";
  if (src === "votes") return a.votes.n === 0 ? "pas de vote sur ce sujet" : `trop peu de votes (${a.votes.n} sur ${VOTES_MIN_N} nécessaires)`;
  if (a.discours.n >= DISCOURS_MIN_POSTS && a.discours.speakers < DISCOURS_MIN_SPEAKERS) return `trop peu d'orateurs différents (${a.discours.speakers})`;
  return `pas encore assez de prises de parole analysées (${a.discours.n})`;
}

export interface Cluster {
  x: number;
  srcs: AlignSource[];
  lane: "up" | "down";
}

/** Regroupe les points trop proches pour avoir chacun leur étiquette, puis répartit les étiquettes au-dessus / au-dessous. */
export function alignLayout(a: AlignData): { pts: { src: AlignSource; x: number }[]; clusters: Cluster[] } {
  const pts = SOURCES.filter((s) => a[s].ok && a[s].stance !== null)
    .map((s) => ({ src: s, x: ((Math.max(-1, Math.min(1, a[s].stance!)) + 1) / 2) * 100 }))
    .sort((p, q) => p.x - q.x);
  const groups: { xs: number[]; srcs: AlignSource[] }[] = [];
  for (const p of pts) {
    const g = groups[groups.length - 1];
    if (g && p.x - g.xs[g.xs.length - 1] < 9) {
      g.xs.push(p.x);
      g.srcs.push(p.src);
    } else groups.push({ xs: [p.x], srcs: [p.src] });
  }
  const clusters: Cluster[] = [];
  const last: Record<"up" | "down", number | null> = { up: null, down: null };
  for (const g of groups) {
    const x = g.xs.reduce((s, v) => s + v, 0) / g.xs.length;
    const room = (lane: "up" | "down") => (last[lane] === null ? Infinity : x - last[lane]!);
    const lane = room("up") >= 34 ? "up" : room("down") >= 34 ? "down" : room("up") >= room("down") ? "up" : "down";
    last[lane] = x;
    clusters.push({ x, srcs: g.srcs, lane });
  }
  return { pts, clusters };
}

function Label({ c }: { c: Cluster }) {
  // Largeur estimée de l'étiquette (12 px ≈ 6,6 px par lettre + pastille) : on la centre sur le point,
  // sans jamais sortir du graphique.
  const w = Math.round(c.srcs.reduce((t, k) => t + SOURCE_LABEL[k].length * 6.6 + 11, 0) + 8 * (c.srcs.length - 1));
  const anchor = { left: `clamp(-6px, calc(${c.x}% - ${w / 2}px), calc(100% - ${w - 6}px))`, width: w };
  return (
    <span className="absolute whitespace-nowrap inline-flex items-center gap-2 text-[12px] font-semibold text-ink-2 leading-none" style={anchor}>
      {c.srcs.map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <Marker src={s} size={7} />
          {SOURCE_LABEL[s]}
        </span>
      ))}
    </span>
  );
}

/** Le graphique seul : échelle, points étiquetés, trait d'écart, pôles. */
export function AlignmentChart({ a, themeId, showScale = false }: { a: AlignData; themeId: string; showScale?: boolean }) {
  const pl = themePlain(themeId);
  const { pts, clusters } = alignLayout(a);
  const up = clusters.filter((c) => c.lane === "up");
  const down = clusters.filter((c) => c.lane === "down");
  const lo = pts.length >= 2 ? pts[0].x : null;
  const hi = pts.length >= 2 ? pts[pts.length - 1].x : null;
  const missing = SOURCES.filter((s) => !a[s].ok);
  return (
    <div>
      <div className="px-2">
        {up.length > 0 && (
          <div className="relative h-5">
            {up.map((c) => (
              <Label key={c.srcs.join()} c={c} />
            ))}
          </div>
        )}
        <div className="relative h-5" role="img" aria-label={pts.map((p) => `${SOURCE_LABEL[p.src]} : ${stanceWords(themeId, a[p.src].stance)?.text ?? ""}`).join(" ; ") || "aucun repère fiable"}>
          <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 rounded-full bg-border-2/70" />
          <span className="absolute left-1/2 top-0.5 bottom-0.5 w-px bg-ink-3/60" />
          {lo !== null && hi !== null && <span className={`absolute top-1/2 -translate-y-1/2 rounded-full ${a.alert ? "h-[3px] bg-ink" : "h-0.5 bg-ink-3"}`} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />}
          {pts.map((p) => (
            <span key={p.src} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 inline-flex" style={{ left: `${p.x}%` }} title={`${SOURCE_LABEL[p.src]} : ${stanceWords(themeId, a[p.src].stance)?.text ?? ""}`}>
              <Marker src={p.src} size={13} />
            </span>
          ))}
        </div>
        {down.length > 0 && (
          <div className="relative h-5 pt-1.5">
            {down.map((c) => (
              <Label key={c.srcs.join()} c={c} />
            ))}
          </div>
        )}
      </div>
      {showScale && (
        <div className="flex justify-between gap-3 text-[11px] text-ink-3 mt-1.5">
          <span className="min-w-0">← {pl.left}</span>
          <span className="min-w-0 text-end">{pl.right} →</span>
        </div>
      )}
      {missing.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-ink-3">
          {missing.map((s) => (
            <li key={s} className="flex items-baseline gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full border border-ink-3/70 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">{SOURCE_LABEL[s]} :</span> {missingText(s, a)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Pastille discrète « Écart programme / votes » (icône + texte, jamais la couleur seule). */
export function AlertPill({ pair, size = "sm" }: { pair: [AlignSource, AlignSource] | null; size?: "sm" | "md" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-warn/60 text-warn font-semibold leading-tight whitespace-nowrap ${size === "md" ? "text-sm px-2.5 py-1" : "text-[11px] px-2 py-0.5"}`} title={ecartBadge(pair)}>
      <AlertTriangle size={size === "md" ? 14 : 12} strokeWidth={2.4} aria-hidden /> {ecartTag(pair)}
    </span>
  );
}

const stancesOf = (a: AlignData) => ({
  programme: a.programme.ok ? a.programme.stance : null,
  votes: a.votes.ok ? a.votes.stance : null,
  discours: a.discours.ok ? a.discours.stance : null,
  pair: a.pair,
});

/**
 * Une carte parti × sujet : en-tête (fourni), pastille d'écart, phrase clé (« Écrit … mais vote … »),
 * graphique, et lien vers les preuves.
 */
export function AlignmentRow({
  a,
  themeId,
  partyId,
  head,
  right,
  showScale = false,
  className = "",
  hideLink = false,
  children,
}: {
  hideLink?: boolean;
  a: AlignData;
  themeId: string;
  partyId: string;
  /** Conservé pour compatibilité : la phrase clé ne répète plus le nom du parti. */
  partyShort?: string;
  head?: ReactNode;
  right?: ReactNode;
  showScale?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const href = `/ecarts/${partyId}/${themeId}`;
  const anyOk = a.programme.ok || a.votes.ok || a.discours.ok;
  return (
    <div className={`rounded-2xl border border-border p-3 md:p-4 ${className}`}>
      {(head || right || a.alert) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mb-1">
          {head}
          {a.alert && <AlertPill pair={a.pair} />}
          {right && <span className="ml-auto">{right}</span>}
        </div>
      )}
      {a.alert && <p className={`font-semibold leading-snug text-ink mb-2 ${hideLink ? "text-lg md:text-xl" : "text-[15px]"}`}>{ecartHeadline(themeId, stancesOf(a))}</p>}
      <AlignmentChart a={a} themeId={themeId} showScale={showScale} />
      {!hideLink && anyOk && (
        <div className="mt-2">
          <Link href={href} className={`inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline ${a.alert ? "text-sm" : "text-xs"}`}>
            {a.alert ? "Voir les preuves et le calcul" : "Voir le calcul et les preuves"} <ArrowRight size={a.alert ? 14 : 12} />
          </Link>
        </div>
      )}
      {children}
    </div>
  );
}

/** Légende, une seule fois par page. */
export function AlignmentLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div className="text-xs text-ink-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {SOURCES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <Marker src={s} size={10} /> <strong className="text-ink font-semibold">{SOURCE_LABEL[s]}</strong> <span className="text-ink-3">{SOURCE_HINT[s]}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-5 h-[3px] rounded-full bg-ink" aria-hidden /> <span className="text-ink-3">écart d&apos;au moins {String(ALERT_GAP).replace(".", ",")} entre deux repères de côtés opposés</span>
        </span>
      </div>
      {!compact && (
        <p className="text-ink-3 leading-relaxed">
          Un repère n&apos;apparaît que s&apos;il repose sur assez d&apos;éléments (pour le discours : {DISCOURS_MIN_POSTS} prises de parole de {DISCOURS_MIN_SPEAKERS} élus différents). {ECART_CAVEAT}
        </p>
      )}
    </div>
  );
}
