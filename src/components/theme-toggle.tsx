"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

type Mode = "light" | "dark" | "system";
const ORDER: Mode[] = ["system", "light", "dark"];
const KEY = "coherence-theme";

function read(): Mode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function write(mode: Mode) {
  const root = document.documentElement;
  if (mode === "system") delete root.dataset.theme;
  else root.dataset.theme = mode;
  try {
    if (mode === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    /* stockage indisponible */
  }
  listeners.forEach((l) => l());
}

/** Bascule clair / sombre / système, mémorisée dans le navigateur. Le script inline du layout évite le flash au chargement. */
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, read, () => "system" as Mode);
  const next = () => write(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]);
  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;
  const label = mode === "dark" ? "Thème sombre" : mode === "light" ? "Thème clair" : "Thème du système";
  return (
    <button onClick={next} className="btn-ghost !p-2 rounded-full" title={`${label} — cliquer pour changer`} aria-label={label}>
      <Icon size={16} />
    </button>
  );
}
