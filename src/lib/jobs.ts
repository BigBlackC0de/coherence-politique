import { eq, desc } from "drizzle-orm";
import { getDb, nowIso, schema } from "./db";

/**
 * Exécuteur de jobs en arrière-plan (ingestion, analyse).
 * Les jobs tournent dans le process Next.js (ou le CLI) et persistent leur
 * progression en base pour que l'UI puisse la suivre.
 */

export interface JobContext {
  id: string;
  log: (msg: string) => void;
  setProgress: (progress: number, total?: number, message?: string) => void;
  addUsage: (u: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number; costUsd: number }) => void;
  /** Lève une erreur si le budget du job est dépassé ou si le job est annulé. */
  checkpoint: () => void;
  budgetUsd: number;
  costUsd: () => number;
}

const cancelFlags = new Map<string, boolean>();
const running = new Map<string, Promise<void>>();

export class JobCancelled extends Error {}
export class BudgetExceeded extends Error {}

/** Annule un job. S'il tourne dans un autre processus (CLI), la demande passe par la base et ce processus l'applique à son prochain point de contrôle. */
export function cancelJob(id: string) {
  cancelFlags.set(id, true);
  if (!running.has(id)) getDb().update(schema.jobs).set({ status: "cancel-requested" }).where(eq(schema.jobs.id, id)).run();
}

/** Le processus existe-t-il encore ? (signal 0 : simple test, n'envoie rien) */
function processAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function isJobRunning(kind: string): boolean {
  const db = getDb();
  const r = db.select().from(schema.jobs).where(eq(schema.jobs.kind, kind)).all();
  return r.some((j) => (j.status === "running" || j.status === "cancel-requested") && (running.has(j.id) || processAlive(j.pid)));
}

export function listJobs(limit = 30) {
  return getDb().select().from(schema.jobs).orderBy(desc(schema.jobs.startedAt)).limit(limit).all();
}

export function getJob(id: string) {
  return getDb().select().from(schema.jobs).where(eq(schema.jobs.id, id)).get();
}

export function startJob(kind: string, fn: (ctx: JobContext) => Promise<void>, opts?: { budgetUsd?: number }): string {
  const db = getDb();
  const id = `${kind}-${Date.now().toString(36)}`;
  const budgetUsd = opts?.budgetUsd ?? Number(process.env.COHERENCE_BUDGET_PER_JOB_USD ?? 25);
  db.insert(schema.jobs)
    .values({ id, kind, status: "running", startedAt: nowIso(), message: "Démarrage…", pid: process.pid })
    .run();

  let logBuf = "";
  let cost = 0;
  let lastFlush = 0;
  let lastCancelCheck = 0;
  const state = { progress: 0, total: 0, message: "", in: 0, out: 0, cache: 0 };

  const flush = (force = false) => {
    const now = Date.now();
    if (!force && now - lastFlush < 700) return;
    lastFlush = now;
    db.update(schema.jobs)
      .set({
        progress: state.progress,
        total: state.total,
        message: state.message,
        log: logBuf.slice(-20000),
        inputTokens: state.in,
        outputTokens: state.out,
        cacheReadTokens: state.cache,
        costUsd: cost,
      })
      .where(eq(schema.jobs.id, id))
      .run();
  };

  const ctx: JobContext = {
    id,
    budgetUsd,
    costUsd: () => cost,
    log: (msg) => {
      const line = `[${new Date().toLocaleTimeString("fr-FR")}] ${msg}`;
      logBuf += line + "\n";
      console.log(`(${id}) ${msg}`);
      flush();
    },
    setProgress: (progress, total, message) => {
      state.progress = progress;
      if (total !== undefined) state.total = total;
      if (message !== undefined) state.message = message;
      flush();
    },
    addUsage: (u) => {
      state.in += u.inputTokens;
      state.out += u.outputTokens;
      state.cache += u.cacheReadTokens ?? 0;
      cost += u.costUsd;
      flush();
    },
    checkpoint: () => {
      // Annulation demandée depuis un autre processus (interface admin) : vérifiée toutes les 5 s au plus.
      if (Date.now() - lastCancelCheck > 5000) {
        lastCancelCheck = Date.now();
        if (getJob(id)?.status === "cancel-requested") cancelFlags.set(id, true);
      }
      if (cancelFlags.get(id)) throw new JobCancelled("Job annulé par l'utilisateur");
      if (cost > budgetUsd) throw new BudgetExceeded(`Budget du job dépassé (${cost.toFixed(2)} $ > ${budgetUsd} $)`);
    },
  };

  const p = (async () => {
    try {
      await fn(ctx);
      state.message = state.message || "Terminé";
      flush(true);
      db.update(schema.jobs).set({ status: "done", finishedAt: nowIso(), message: "Terminé ✔" }).where(eq(schema.jobs.id, id)).run();
    } catch (e) {
      const err = e as Error;
      const status = err instanceof JobCancelled ? "cancelled" : "error";
      ctx.log(`${status === "cancelled" ? "Annulé" : "Erreur"} : ${err.message}`);
      flush(true);
      db.update(schema.jobs).set({ status, finishedAt: nowIso(), message: err.message.slice(0, 300) }).where(eq(schema.jobs.id, id)).run();
    } finally {
      running.delete(id);
      cancelFlags.delete(id);
    }
  })();
  running.set(id, p);
  return id;
}

/** Pour le CLI : attendre la fin d'un job. */
export async function waitJob(id: string) {
  const p = running.get(id);
  if (p) await p;
  return getJob(id);
}

/** Les jobs « en cours » dont le processus n'existe plus (serveur redémarré, CLI tué) sont orphelins. */
export function reapOrphanJobs() {
  const db = getDb();
  const orphans = db.select().from(schema.jobs).all().filter((j) => j.status === "running" || j.status === "cancel-requested");
  for (const j of orphans) {
    if (!running.has(j.id) && !processAlive(j.pid)) {
      db.update(schema.jobs).set({ status: "error", message: "Interrompu (redémarrage du serveur)", finishedAt: nowIso() }).where(eq(schema.jobs.id, j.id)).run();
    }
  }
}
