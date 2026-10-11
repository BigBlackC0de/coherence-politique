"use client";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, Link2, Share2, X } from "lucide-react";
import { withFormat, type ShareFormat } from "@/lib/share/paths";

/**
 * Bouton « Partager » : ouvre un petit menu avec l'aperçu de l'image, le téléchargement
 * (story 1080×1920 ou carré 1080×1080), la copie du lien et, sur mobile, le partage natif
 * de l'image (`navigator.share` avec fichier) quand le navigateur le permet.
 *
 * `image` : chemin d'une route `/partager/...` (voir `shareImage` dans `@/lib/share/paths`).
 * `url`   : page à partager (par défaut, la page courante).
 */
export function ShareButton({ image, url, title, text, filename, label = "Partager", size = "md", align = "right" }: { image: string; url?: string; title: string; text?: string; filename: string; label?: string; size?: "md" | "sm"; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ShareFormat>("carre");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [storyFile, setStoryFile] = useState<File | null>(null);
  const [canShareFile, setCanShareFile] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((msg: string) => {
    setStatus(msg);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(""), 4000);
  }, []);

  const pageUrl = useCallback(() => new URL(url ?? window.location.href, window.location.href).toString(), [url]);
  const fileName = (f: ShareFormat) => `${filename}-${f}.png`;

  const fetchImage = useCallback(async (f: ShareFormat) => {
    const res = await fetch(withFormat(image, f));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  }, [image]);

  // Fermeture : clic à l'extérieur, Échap (le focus revient sur le bouton).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Le menu est rendu dans <body> (portail) en position fixe, sous le bouton ou au-dessus s'il manque
  // de place : il n'est jamais rogné par un parent en `overflow: hidden` ou transformé.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect();
      const el = panelRef.current;
      if (!b || !el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const left = Math.min(Math.max(8, align === "right" ? b.right - w : b.left), vw - w - 8);
      const below = b.bottom + 8;
      const top = below + h <= vh - 8 || b.top - h - 8 < 8 ? Math.max(8, Math.min(below, vh - h - 8)) : b.top - h - 8;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.visibility = "visible";
    };
    place();
    // Le menu est rendu à la fin du document : on y amène le focus clavier.
    panelRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    const ro = new ResizeObserver(place);
    if (panelRef.current) ro.observe(panelRef.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true, capture: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, { capture: true });
    };
  }, [open, align]);

  // À l'ouverture : on prépare l'image story pour que le partage natif parte directement au clic
  // (Safari exige que navigator.share soit appelé pendant le geste de l'utilisateur).
  useEffect(() => {
    if (!open || storyFile || typeof navigator.share !== "function") return;
    let cancelled = false;
    fetchImage("story")
      .then((blob) => {
        if (cancelled) return;
        const file = new File([blob], `${filename}-story.png`, { type: "image/png" });
        setStoryFile(file);
        setCanShareFile(typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, storyFile, fetchImage, filename]);

  async function download(f: ShareFormat) {
    setBusy(f);
    try {
      const blob = f === "story" && storyFile ? storyFile : await fetchImage(f);
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = fileName(f);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      say("Image téléchargée.");
    } catch {
      window.open(withFormat(image, f), "_blank", "noopener");
      say("Téléchargement impossible : l'image s'ouvre dans un nouvel onglet.");
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    const link = pageUrl();
    try {
      await navigator.clipboard.writeText(link);
      say("Lien copié.");
    } catch {
      say(`Copie impossible. Le lien : ${link}`);
    }
  }

  async function nativeShare(withFile: boolean) {
    const link = pageUrl();
    try {
      if (withFile && storyFile) await navigator.share({ files: [storyFile], title, text: `${text ?? title} ${link}` });
      else await navigator.share({ title, text: text ?? title, url: link });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") say("Partage impossible depuis ce navigateur : téléchargez l'image.");
    }
  }

  const sm = size === "sm";
  // Le menu n'est rendu qu'après un clic (jamais côté serveur) : navigator est disponible.
  const canShareLink = open && typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        className={sm ? "pill" : "btn-secondary"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        title={sm ? `${label} : ${title}` : undefined}
      >
        <Share2 size={sm ? 13 : 16} aria-hidden />
        {label}
      </button>
      {open &&
        createPortal(
          <div ref={panelRef} id={panelId} role="dialog" aria-label={`Partager : ${title}`} style={{ visibility: "hidden", top: 0, left: 0 }} className="card fixed z-50 p-3 w-[min(20rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto text-left">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-sm font-semibold leading-tight">Partager en image</div>
              <button type="button" className="btn-ghost !p-1.5" onClick={() => setOpen(false)} aria-label="Fermer">
                <X size={16} aria-hidden />
              </button>
            </div>
            <div className="flex gap-1.5 mb-2" role="group" aria-label="Format de l'aperçu">
              {(["carre", "story"] as const).map((f) => (
                <button key={f} type="button" className={`pill !text-xs !py-1 ${preview === f ? "pill-active" : ""}`} aria-pressed={preview === f} onClick={() => setPreview(f)}>
                  {f === "carre" ? "Carré" : "Story"}
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-surface-2 overflow-hidden flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- image générée à la volée, pas d'optimisation utile */}
              <img
                key={preview}
                src={withFormat(image, preview)}
                alt={`Aperçu de l'image à partager (${preview === "carre" ? "carré" : "story"}) : ${title}`}
                width={1080}
                height={preview === "carre" ? 1080 : 1920}
                className="h-52 w-auto"
              />
            </div>
            <div className="grid gap-1.5 mt-3">
              {canShareFile && (
                <button type="button" className="btn-primary !py-2 !text-sm" onClick={() => nativeShare(true)}>
                  <Share2 size={15} aria-hidden /> Partager l&apos;image…
                </button>
              )}
              <button type="button" className="btn-secondary !py-2 !text-sm !justify-start" onClick={() => download("story")} disabled={busy !== null}>
                <Download size={15} aria-hidden /> {busy === "story" ? "Préparation…" : "Télécharger l'image (story)"}
              </button>
              <button type="button" className="btn-secondary !py-2 !text-sm !justify-start" onClick={() => download("carre")} disabled={busy !== null}>
                <Download size={15} aria-hidden /> {busy === "carre" ? "Préparation…" : "Télécharger (carré)"}
              </button>
              <button type="button" className="btn-secondary !py-2 !text-sm !justify-start" onClick={copyLink}>
                {status === "Lien copié." ? <Check size={15} aria-hidden className="text-good" /> : <Link2 size={15} aria-hidden />} Copier le lien
              </button>
              {canShareLink && !canShareFile && (
                <button type="button" className="btn-ghost !py-2 !text-sm !justify-start" onClick={() => nativeShare(false)}>
                  <Share2 size={15} aria-hidden /> Partager le lien…
                </button>
              )}
            </div>
            <p className="text-[11px] text-ink-3 mt-2 leading-snug">Story : 1080×1920 (Instagram, TikTok). Carré : 1080×1080 (posts).</p>
            <p role="status" aria-live="polite" className="text-xs text-ink-2 mt-1 min-h-4 break-words">
              {status}
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}
