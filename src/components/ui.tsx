import Link from "next/link";
import type { ReactNode } from "react";
import { THEME_BY_ID } from "@/lib/config/themes";
import { AlignmentLegend } from "./alignment";
import { VERDICT_PLAIN, themePlain, stanceWords } from "@/lib/config/plain";

export function Card({ children, className = "", title, subtitle, action, hover = false, id }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; hover?: boolean; id?: string }) {
  return (
    <section id={id} className={`card p-4 md:p-6 ${hover ? "card-hover" : ""} ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="text-xs text-ink-3 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** En-tête de page : surtitre, titre, description, actions. */
export function PageHeader({ eyebrow, title, description, actions, children }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 rise">
      <div className="max-w-3xl">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-[15px] md:text-base text-ink-2 mt-3 leading-relaxed">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/** Tuile de chiffre clé. */
export function Stat({ label, value, hint, icon, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "good" | "warn" | "bad" | "accent" }) {
  const toneCls = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : tone === "accent" ? "text-accent-ink" : "";
  return (
    <div className="card p-4 flex items-start gap-3">
      {icon && <span className="mt-0.5 inline-flex w-8 h-8 items-center justify-center rounded-lg bg-surface-2 text-ink-2 shrink-0">{icon}</span>}
      <div className="min-w-0">
        <div className="text-xs text-ink-3">{label}</div>
        <div className={`text-2xl md:text-3xl font-bold num tracking-tight ${toneCls}`}>{value}</div>
        {hint && <div className="text-[11px] text-ink-3 mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

/** Onglets par liens (paramètre d'URL). */
export function LinkTabs({ items }: { items: { href: string; label: ReactNode; active: boolean }[] }) {
  return (
    <div className="inline-flex rounded-xl border border-border bg-surface p-1 text-sm">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className={`px-3 py-1.5 rounded-lg transition-colors ${it.active ? "bg-ink text-bg font-medium" : "text-ink-2 hover:bg-surface-2"}`}>
          {it.label}
        </Link>
      ))}
    </div>
  );
}

export const fmtPct = (x: number, digits = 0) => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: digits })} %`;
export const fmtInt = (n: number) => n.toLocaleString("fr-FR");

export function PartyChip({ id, name, color, size = "sm" }: { id: string; name: string; color: string; size?: "sm" | "md" }) {
  return (
    <Link href={`/partis/${id}`} className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface hover:bg-surface-2 ${size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}>
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      <span className="font-medium">{name}</span>
    </Link>
  );
}

export function ThemeChip({ id }: { id: string }) {
  const t = THEME_BY_ID[id];
  if (!t) return <span className="text-xs text-ink-3">{id}</span>;
  return (
    <Link href={`/themes/${id}`} className="inline-flex items-center gap-1 text-xs rounded-full bg-surface-2 border border-border px-2 py-0.5 hover:border-accent">
      <span aria-hidden>{t.emoji}</span>
      {t.label}
    </Link>
  );
}

export const fmtStance = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}`);

/**
 * Échelle -1 … +1 sobre (même langage que le graphique des écarts, `components/alignment.tsx`) :
 * trait neutre, repère central, points aux couleurs des sources (programme, votes, discours).
 * `declaredNeutral` dessine le repère « déclaré » en anneau neutre quand ce n'est pas un programme.
 */
export function StanceBar({ declared, voted, posts, height = 10, showScale = false, labelLeft, labelRight, themeId, declaredLabel = "Ce qu'il dit", declaredNeutral = false }: { declared?: number | null; voted?: number | null; posts?: number | null; height?: number; showScale?: boolean; labelLeft?: string; labelRight?: string; themeId?: string; declaredLabel?: string; declaredNeutral?: boolean }) {
  if (themeId && showScale && !labelLeft) {
    const p = themePlain(themeId);
    labelLeft = p.left;
    labelRight = p.right;
  }
  const pos = (v: number) => `${((v + 1) / 2) * 100}%`;
  const dot = (v: number | null | undefined, kind: "declared" | "voted" | "posts") => {
    if (v === null || v === undefined) return null;
    const base = "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full";
    const style = { left: pos(v), boxShadow: "0 0 0 2px var(--surface)" };
    const words = themeId ? stanceWords(themeId, v)?.text : fmtStance(v);
    if (kind === "declared") return <span className={`${base} ${declaredNeutral ? "border-2 border-ink-2 bg-surface" : "bg-src-programme"}`} style={{ ...style, width: height + 2, height: height + 2 }} title={`${declaredLabel} : ${words}`} />;
    if (kind === "posts") return <span className={`${base} bg-src-discours`} style={{ ...style, width: height + 2, height: height + 2 }} title={`Ses prises de parole : ${words}`} />;
    return <span className={`${base} bg-src-votes`} style={{ ...style, width: height + 2, height: height + 2 }} title={`Ce qu'il vote : ${words}`} />;
  };
  return (
    <div className="w-full">
      <div className="relative w-full" style={{ height: height + 4 }}>
        <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 rounded-full bg-border-2/70" />
        <span className="absolute left-1/2 top-0 bottom-0 w-px bg-ink-3/60" />
        {declared !== null && declared !== undefined && voted !== null && voted !== undefined && (
          <span className="absolute top-1/2 -translate-y-1/2 h-0.5 bg-ink-3" style={{ left: pos(Math.min(declared, voted)), width: `calc(${pos(Math.max(declared, voted))} - ${pos(Math.min(declared, voted))})` }} />
        )}
        {dot(posts, "posts")}
        {dot(declared, "declared")}
        {dot(voted, "voted")}
      </div>
      {showScale && (
        <div className="flex justify-between text-[11px] text-ink-3 mt-1">
          <span className="max-w-[45%] truncate" title={labelLeft}>
            ← {labelLeft ?? "-1"}
          </span>
          <span className="max-w-[45%] truncate text-right" title={labelRight}>
            {labelRight ?? "+1"} →
          </span>
        </div>
      )}
    </div>
  );
}

/** Légende des repères Programme / Votes / Discours (voir `components/alignment.tsx`). */
export function StanceLegend({ compact = false }: { compact?: boolean }) {
  return <AlignmentLegend compact={compact} />;
}

const TONE_CLS: Record<string, string> = {
  good: "text-good border-good/40 bg-good/10",
  neutral: "text-ink-2 border-border bg-surface-2",
  warn: "text-warn border-warn/40 bg-warn/10",
  bad: "text-bad border-bad/40 bg-bad/10",
  muted: "text-ink-3 border-border bg-surface",
};
/** Verdict en mots simples (le terme technique est dans l'infobulle). */
export function Verdict({ v, size = "sm" }: { v: string | null | undefined; size?: "sm" | "md" }) {
  if (!v) return <span className="text-xs text-ink-3">pas encore de verdict</span>;
  const d = VERDICT_PLAIN[v];
  if (!d) return <span className="text-xs text-ink-3">{v}</span>;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold rounded-full border whitespace-nowrap ${size === "md" ? "text-sm px-3 py-1" : "text-xs px-2 py-0.5"} ${TONE_CLS[d.tone]}`} title={`${d.short} : ${d.explain}`}>
      <span aria-hidden>{d.emoji}</span> {d.label}
    </span>
  );
}

export function Position({ p, badge = false }: { p: string | null | undefined; badge?: boolean }) {
  const map: Record<string, string> = { pour: "text-good", contre: "text-bad", abstention: "text-warn", nonVotant: "text-ink-3" };
  const bg: Record<string, string> = { pour: "bg-good/10 border-good/30", contre: "bg-bad/10 border-bad/30", abstention: "bg-warn/10 border-warn/30", nonVotant: "bg-surface-2 border-border" };
  const lbl: Record<string, string> = { pour: "Pour", contre: "Contre", abstention: "Abstention", nonVotant: "Non votant" };
  if (!p) return <span className="text-ink-3 text-xs">—</span>;
  if (badge) return <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${map[p] ?? ""} ${bg[p] ?? ""}`}>{lbl[p] ?? p}</span>;
  return <span className={`text-xs font-semibold ${map[p] ?? ""}`}>{lbl[p] ?? p}</span>;
}

const SALIENCE_LABEL = ["", "détail", "mineur", "notable", "important", "majeur"];
export function Salience({ s }: { s: number | null | undefined }) {
  if (!s) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 ${s >= 4 ? "bg-accent-soft text-accent-ink" : "bg-surface-2 text-ink-3"}`} title={`Importance du vote : ${s} sur 5`}>
      {"●".repeat(s)}
      {"○".repeat(5 - s)} {SALIENCE_LABEL[s]}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border p-6 text-sm text-ink-3 text-center">{children}</div>;
}

export const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
export const fmtUsd = (v: number) => `${v.toFixed(2)} $`;

/** Titre de section dans une page (h2), avec un lien « voir plus » facultatif à droite. */
export function SectionTitle({ title, href, more, children }: { title: ReactNode; href?: string; more?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 mb-4">
      <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">{title}</h2>
      {href && more && (
        <Link href={href} className="text-sm font-semibold text-accent-ink hover:underline inline-flex items-center gap-1 shrink-0">
          {more} →
        </Link>
      )}
      {children}
    </div>
  );
}

/** Le site de l'Assemblée renvoie parfois des erreurs passagères : on prévient, sans alarmer. */
export const OFFICIAL_SITE_HINT = "Si le site de l'Assemblée ne répond pas, réessayez dans un instant.";

/**
 * Lien vers une source officielle (Assemblée, Sénat). `an` ajoute l'avertissement sur les pannes
 * passagères du site de l'Assemblée ; `copied` rappelle que le texte complet est déjà recopié ici.
 */
export function OfficialLink({ href, children, className = "", an = false, copied = false }: { href: string; children: ReactNode; className?: string; an?: boolean; copied?: boolean }) {
  const hint = [an ? OFFICIAL_SITE_HINT : "", copied ? "Le texte complet est déjà recopié sur cette page." : ""].filter(Boolean).join(" ");
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className} title={hint || undefined}>
      {children}
    </a>
  );
}
