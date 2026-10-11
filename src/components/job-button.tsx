"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface JobLite {
  id: string;
  kind: string;
  status: string;
  progress: number;
  total: number;
  message: string | null;
}

/**
 * Bouton « lancer ce job » autonome (hors panneau Jobs), avec suivi de progression.
 */
export function JobButton({ kind, label, budgetUsd = 100, className = "" }: { kind: string; label: string; budgetUsd?: number; className?: string }) {
  const [running, setRunning] = useState<JobLite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await fetch("/api/jobs");
      if (!r.ok || !alive) return;
      const jobs = (await r.json()) as JobLite[];
      const j = jobs.find((x) => x.kind === kind && x.status === "running") ?? null;
      setRunning((prev) => {
        if (prev && !j) router.refresh();
        return j;
      });
    };
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [kind, router]);

  const launch = async () => {
    setError(null);
    const r = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, params: {}, budgetUsd }) });
    const j = (await r.json()) as { id?: string; error?: string };
    if (j.error) setError(j.error);
  };

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <button onClick={launch} disabled={!!running} className="rounded bg-accent text-on-accent px-3 py-1.5 text-sm disabled:opacity-60">
        {running ? "En cours…" : label}
      </button>
      {running && (
        <div className="flex-1 min-w-48">
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: running.total ? `${(running.progress / running.total) * 100}%` : "30%" }} />
          </div>
          <div className="text-xs text-ink-2 mt-1">{running.message ?? "Démarrage…"}</div>
        </div>
      )}
      {error && <span className="text-bad text-xs">{error}</span>}
    </div>
  );
}
