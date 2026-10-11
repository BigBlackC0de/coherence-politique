"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { HelpCircle, Lightbulb } from "lucide-react";
import { GLOSSARY } from "@/lib/config/plain";

/**
 * Bulles « c'est quoi ? » : un petit rond avec un point d'interrogation, ou un mot souligné en pointillés.
 * S'ouvre au survol, au focus clavier ou au toucher. Le contenu vient du glossaire ou est passé directement.
 */
export function Help({ k, title, children, label, className = "" }: { k?: string; title?: string; children?: ReactNode; label?: ReactNode; className?: string }) {
  const entry = k ? GLOSSARY[k] : undefined;
  const t = title ?? entry?.title ?? "";
  const body = children ?? entry?.text ?? "";
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <span ref={ref} className={`relative inline-block align-middle ${className}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-describedby={id} aria-expanded={open} onClick={() => setOpen((o) => !o)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} className={label ? "help-term" : "help-dot"}>
        {label ?? <HelpCircle size={14} strokeWidth={2.2} />}
      </button>
      <span role="tooltip" id={id} hidden={!open} className={`help-pop ${open ? "help-pop-open" : ""}`}>
        {t && <span className="block font-semibold mb-1">{t}</span>}
        <span className="block text-ink-2 leading-relaxed">{body}</span>
      </span>
    </span>
  );
}

/** Encadré « En clair » : l'explication en langage courant, bien visible. */
export function Explain({ title = "En clair", children, tone = "accent", icon }: { title?: ReactNode; children: ReactNode; tone?: "accent" | "neutral" | "good" | "warn" | "bad"; icon?: ReactNode }) {
  const cls = tone === "accent" ? "bg-accent-soft border-accent/30" : tone === "good" ? "bg-good/10 border-good/30" : tone === "warn" ? "bg-warn/10 border-warn/30" : tone === "bad" ? "bg-bad/10 border-bad/30" : "bg-surface-2 border-border";
  return (
    <div className={`rounded-2xl border p-4 flex gap-3 ${cls}`}>
      <span className="shrink-0 mt-0.5 inline-flex w-8 h-8 rounded-full bg-surface items-center justify-center text-accent-ink shadow-sm">{icon ?? <Lightbulb size={16} />}</span>
      <div className="min-w-0 text-sm leading-relaxed">
        <div className="font-semibold mb-0.5">{title}</div>
        <div className="text-ink-2">{children}</div>
      </div>
    </div>
  );
}
