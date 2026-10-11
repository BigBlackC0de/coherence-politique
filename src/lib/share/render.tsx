import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { loadFonts, FONT_FAMILY } from "./fonts";
import { SHARE_FORMATS, type ShareFormat } from "./paths";
import { SITE_NAME } from "../config/site";
import { Logo } from "../../components/logo";

/**
 * Briques communes des images de partage (Satori : flexbox uniquement, chaque bloc à
 * plusieurs enfants doit être `display: flex`). Couleurs reprises de `globals.css` (thème clair).
 */

export const C = {
  bg: "#f6f7f9",
  surface: "#ffffff",
  surface2: "#f1f3f6",
  border: "#e1e4ea",
  border2: "#c9ced8",
  ink: "#0f1115",
  ink2: "#4a515c",
  ink3: "#8a909a",
  accent: "#0f1115",
  accentInk: "#0f1115",
  accentSoft: "#eceef2",
  left: "#d6453d",
  right: "#3d6fd8",
  neutral: "#a7adb7",
  good: "#2f9e68",
  warn: "#e0960c",
  bad: "#d64545",
};

export const TONE: Record<string, { fg: string; bg: string; border: string }> = {
  good: { fg: "#23794f", bg: "#e6f4ec", border: "#a9d8be" },
  neutral: { fg: C.ink2, bg: C.surface2, border: C.border2 },
  warn: { fg: "#9a6407", bg: "#fcf1dc", border: "#efcd8a" },
  bad: { fg: "#b13434", bg: "#fbe8e8", border: "#efb1b1" },
  muted: { fg: C.ink2, bg: C.surface2, border: C.border2 },
};

export const POSITION: Record<string, { label: string; tone: keyof typeof TONE; color: string }> = {
  pour: { label: "Pour", tone: "good", color: C.good },
  contre: { label: "Contre", tone: "bad", color: C.bad },
  abstention: { label: "Abstention", tone: "warn", color: C.warn },
  nonVotant: { label: "Non votant", tone: "muted", color: C.neutral },
};

/** Dimensions et échelle typographique de chaque format. */
export interface Fmt {
  id: ShareFormat;
  w: number;
  h: number;
  pad: number;
  /** multiplicateur des tailles de texte (référence : carré) */
  s: number;
}
const FORMATS: Record<ShareFormat, Fmt> = {
  story: { id: "story", w: 1080, h: 1920, pad: 80, s: 1.18 },
  carre: { id: "carre", w: 1080, h: 1080, pad: 64, s: 1 },
  og: { id: "og", w: 1200, h: 630, pad: 52, s: 0.74 },
};

/** `?format=story|carre|og` (défaut : story). `null` si la valeur est inconnue. */
export function parseFormat(req: NextRequest): Fmt | null {
  const raw = req.nextUrl.searchParams.get("format") ?? "story";
  return (SHARE_FORMATS as readonly string[]).includes(raw) ? FORMATS[raw as ShareFormat] : null;
}

/** Identifiant plausible (avant toute requête) : lettres, chiffres, tirets, soulignés, 80 caractères max. */
export const validId = (id: string) => /^[A-Za-z0-9_-]{1,80}$/.test(id);

/** Adresse affichée en pied d'image : COHERENCE_PUBLIC_URL, sinon l'hôte de la requête. */
export function siteHost(req: NextRequest): { host: string; trusted: boolean } {
  const env = process.env.COHERENCE_PUBLIC_URL?.trim();
  if (env) {
    try {
      const u = new URL(env);
      return { host: `${u.host}${u.pathname}`.replace(/\/+$/, ""), trusted: true };
    } catch {
      /* valeur invalide : on retombe sur l'hôte de la requête */
    }
  }
  const h = req.nextUrl.host.toLowerCase().replace(/[^a-z0-9.:-]/g, "").slice(0, 60);
  return { host: h || "coherence-politique", trusted: false };
}

const NBSP = String.fromCharCode(160);

export const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).replace(/[\s,;:.]+\S*$/, "")}…`;
};
/** Espaces insécables de la typographie française (évite un « » » seul en fin de ligne). */
export const nb = (s: string) => s.replace(/\s+([:;?!»])/g, `${NBSP}$1`).replace(/«\s+/g, `«${NBSP}`);
/** Majuscule initiale (les intitulés officiels commencent souvent par « l'amendement… »). */
export const upperFirst = (s: string) => (s ? s[0].toLocaleUpperCase("fr-FR") + s.slice(1) : s);
export const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }).replace(/ /g, NBSP) : "");
export const fmtPct = (x: number, digits = 0) => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits })} %`;
export const fmtInt = (n: number) => n.toLocaleString("fr-FR");

/* ------------------------------------------------------------------ */
/* Composants                                                          */
/* ------------------------------------------------------------------ */

const row: CSSProperties = { display: "flex", flexDirection: "row", alignItems: "center" };
const col: CSSProperties = { display: "flex", flexDirection: "column" };
export const st = { row, col };

/** Cadre commun : bandeau de couleur, marque, contenu, pied avec les sources et l'adresse du site. */
export function Frame({ f, host, color = C.accent, kind, children, center = false }: { f: Fmt; host: string; color?: string; kind: string; children: ReactNode; center?: boolean }) {
  const s = f.s;
  return (
    <div style={{ ...col, width: "100%", height: "100%", background: C.bg, color: C.ink, fontFamily: FONT_FAMILY }}>
      <div style={{ display: "flex", height: Math.round(18 * s), background: `linear-gradient(90deg, ${color} 0%, ${color} 45%, ${C.bg} 100%)` }} />
      <div style={{ ...col, flex: 1, padding: `${Math.round(f.pad * 0.75)}px ${f.pad}px ${Math.round(f.pad * 0.6)}px` }}>
        <div style={{ ...row, justifyContent: "space-between" }}>
          <div style={{ ...row, gap: 12 * s }}>
            <Logo height={Math.round(56 * s)} color={C.ink} />
            <div style={{ display: "flex", fontSize: 34 * s, fontWeight: 800, letterSpacing: -0.5 }}>{SITE_NAME}</div>
          </div>
          <div style={{ display: "flex", fontSize: 22 * s, fontWeight: 800, letterSpacing: 2.5 * s, textTransform: "uppercase", color: C.accentInk, background: C.accentSoft, borderRadius: 999, padding: `${8 * s}px ${20 * s}px` }}>{kind}</div>
        </div>
        <div style={{ ...col, flex: 1, minHeight: 0, overflow: "hidden", justifyContent: center ? "center" : "flex-start", paddingTop: (center ? 24 : 32) * s, paddingBottom: 24 * s }}>{children}</div>
        <div style={{ ...row, justifyContent: "space-between", borderTop: `2px solid ${C.border}`, paddingTop: 22 * s, fontSize: 22 * s, color: C.ink3, gap: 24 }}>
          <div style={{ display: "flex" }}>{`${SITE_NAME} — sources : Assemblée nationale, Sénat`}</div>
          <div style={{ display: "flex", fontWeight: 600, color: C.ink2 }}>{host}</div>
        </div>
      </div>
    </div>
  );
}

export function Eyebrow({ f, children, color = C.accentInk }: { f: Fmt; children: ReactNode; color?: string }) {
  return <div style={{ display: "flex", fontSize: 24 * f.s, fontWeight: 800, letterSpacing: 2 * f.s, textTransform: "uppercase", color }}>{children}</div>;
}

export function Pill({ f, tone, children, size = 1 }: { f: Fmt; tone: keyof typeof TONE; children: ReactNode; size?: number }) {
  const t = TONE[tone] ?? TONE.muted;
  const s = f.s * size;
  return (
    <div style={{ ...row, alignSelf: "flex-start", fontSize: 26 * s, fontWeight: 800, color: t.fg, background: t.bg, border: `${Math.max(2, 2 * s)}px solid ${t.border}`, borderRadius: 999, padding: `${8 * s}px ${22 * s}px` }}>
      {children}
    </div>
  );
}

export const Dot = ({ color, size }: { color: string; size: number }) => <div style={{ display: "flex", width: size, height: size, borderRadius: 999, background: color, flexShrink: 0 }} />;
export const Ring = ({ size, border, hollow = false }: { size: number; border: number; hollow?: boolean }) => <div style={{ display: "flex", width: size, height: size, borderRadius: 999, background: hollow ? "transparent" : C.surface, border: `${border}px solid ${C.ink}`, flexShrink: 0 }} />;

/**
 * Barre gauche-droite du sujet : −1 (rouge) … 0 (gris) … +1 (bleu).
 * Anneau = position déclarée (programme), disque = position votée.
 */
export function StanceBar({ declared, voted, width, height }: { declared?: number | null; voted?: number | null; width: number; height: number }) {
  const x = (v: number) => ((Math.max(-1, Math.min(1, v)) + 1) / 2) * width;
  const ringSize = Math.round(height + 16);
  const ringBorder = Math.max(3, Math.round(height / 3.2));
  const diskSize = Math.round(height + 8);
  const has = (v: number | null | undefined): v is number => v !== null && v !== undefined;
  return (
    <div style={{ display: "flex", position: "relative", width, height: ringSize }}>
      <div style={{ display: "flex", position: "absolute", left: 0, top: (ringSize - height) / 2, width, height, borderRadius: 999, background: `linear-gradient(90deg, ${C.left} 0%, ${C.neutral} 50%, ${C.right} 100%)` }} />
      <div style={{ display: "flex", position: "absolute", left: width / 2 - 1.5, top: (ringSize - height) / 2, width: 3, height, background: C.surface }} />
      {has(declared) && has(voted) && <div style={{ display: "flex", position: "absolute", left: Math.min(x(declared), x(voted)), top: ringSize / 2 - 2, width: Math.abs(x(declared) - x(voted)), height: 4, background: "rgba(15,17,21,0.6)" }} />}
      {has(voted) && (
        <div style={{ display: "flex", position: "absolute", left: x(voted) - diskSize / 2, top: (ringSize - diskSize) / 2 }}>
          <Dot color={C.ink} size={diskSize} />
        </div>
      )}
      {/* anneau par-dessus, fond blanc sauf s'il recouvre le disque (positions presque identiques) */}
      {has(declared) &&
        (has(voted) && Math.abs(x(declared) - x(voted)) < diskSize / 2 ? (
          // positions presque identiques : anneau évidé et élargi autour du disque
          <div style={{ display: "flex", position: "absolute", left: x(declared) - (ringSize + 12) / 2, top: -6 }}>
            <Ring size={ringSize + 12} border={ringBorder} hollow />
          </div>
        ) : (
          <div style={{ display: "flex", position: "absolute", left: x(declared) - ringSize / 2, top: 0 }}>
            <Ring size={ringSize} border={ringBorder} />
          </div>
        ))}
    </div>
  );
}

/** Légende anneau / disque. */
export function StanceLegend({ f, size = 1 }: { f: Fmt; size?: number }) {
  const s = f.s * size;
  return (
    <div style={{ ...row, gap: 28 * s, fontSize: 22 * s, color: C.ink2 }}>
      <div style={{ ...row, gap: 10 * s }}>
        <Ring size={Math.round(24 * s)} border={Math.max(3, Math.round(5 * s))} /> ce qu&apos;il dit (programme)
      </div>
      <div style={{ ...row, gap: 10 * s }}>
        <Dot color={C.ink} size={Math.round(20 * s)} /> ce qu&apos;il vote
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Réponses                                                            */
/* ------------------------------------------------------------------ */

export const notFoundImage = () => new Response("Introuvable", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
export const badFormat = () => new Response("Format inconnu : utilisez ?format=story, carre ou og.", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });

/** Rend l'image PNG. Mise en cache courte : les données changent à chaque publication de la base. */
export async function renderImage(el: ReactElement, f: Fmt, opts: { filename: string; trusted: boolean }) {
  try {
    const fonts = await loadFonts();
    const img = new ImageResponse(el, {
      width: f.w,
      height: f.h,
      fonts,
      headers: {
        "cache-control": opts.trusted ? "public, max-age=900, stale-while-revalidate=86400" : "private, max-age=300",
        "content-disposition": `inline; filename="${opts.filename.replace(/[^a-z0-9._-]/gi, "-")}-${f.id}.png"`,
        "x-content-type-options": "nosniff",
      },
    });
    // Force le rendu ici pour pouvoir renvoyer une erreur propre si Satori échoue.
    const buf = await img.arrayBuffer();
    return new Response(buf, { status: 200, headers: img.headers });
  } catch (e) {
    console.error("[partager] rendu impossible", e);
    const detail = process.env.NODE_ENV === "production" ? "" : ` : ${String(e)}`;
    return new Response(`Image indisponible${detail}`, { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}
