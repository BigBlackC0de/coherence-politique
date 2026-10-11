import { getSqlite, nowIso } from "../db";
import type { DebateTurn, VoteExplanation } from "../db/schema";
import { ANALYST_PERSONA, pMap } from "./client";
import { llm, modelFor, engine } from "../llm";
import { VoteExplanationOutput } from "./schemas";
import type { JobContext } from "../jobs";

/**
 * Explique chaque scrutin à partir du débat qui l'a précédé en séance :
 * ce qui était réellement voté, ce que cela change, et pourquoi chaque groupe
 * a voté pour ou contre — d'après ce que ses membres ont dit, pas d'après son étiquette.
 * Incrémental : ne traite que les scrutins dont le débat n'a pas encore d'explication.
 */
const DEFAULT_LIMIT = 150;

const SYSTEM = `${ANALYST_PERSONA}

Tâche : expliquer un vote parlementaire à un citoyen qui ne connaît rien à la procédure, à partir de l'extrait du compte rendu officiel de la séance qui précède le vote.

Consignes :
- L'intitulé officiel ne dit souvent que « l'amendement n° 1055 à l'article 3 bis ». Ton premier travail est de dire ce qu'il y avait DEDANS, d'après le débat : qui le défend, ce qu'il change, ce que prévoit l'article visé.
- Écris simplement : phrases courtes, pas de jargon (« amendement » peut rester, mais dis ce qu'il fait). Pas de numéros d'articles sans dire ce qu'ils contiennent.
- Pour chaque groupe, explique son vote UNIQUEMENT à partir de ce que ses membres ont dit dans l'extrait. Un ministre ou un rapporteur ne parle pas pour un groupe. Si aucun membre du groupe ne s'est exprimé, laisse « raison » et « citation » vides : n'invente pas de motif, ne le déduis pas de l'étiquette politique.
- La citation doit être recopiée mot pour mot depuis l'intervention indiquée ; elle sera vérifiée automatiquement et supprimée si elle ne correspond pas.
- « Ça peut surprendre » : quand un vote semble paradoxal pour un lecteur (ex. : la gauche vote contre une mesure qui paraît favorable aux victimes ; voter contre un amendement de suppression revient à garder la mesure), formule la question que se pose le lecteur, puis réponds avec le contexte. Chaque phrase doit se comprendre sans avoir lu le reste : nomme les choses, présente les acteurs, évite les sous-entendus.
- Écris pour quelqu'un qui n'a jamais suivi la politique : remplace « rapporteure » par « la députée chargée du texte », « navette » par « les allers-retours entre l'Assemblée et le Sénat », etc.
- Même rigueur et même ton pour tous les groupes. Ne qualifie pas les arguments (pas de « à juste titre », « prétendument »).`;

const POS_LABEL: Record<string, string> = { pour: "POUR", contre: "CONTRE", abstention: "ABSTENTION" };
const ROLE_LABEL: Record<DebateTurn["role"], string> = { presidence: "présidence de séance", gouvernement: "gouvernement", commission: "commission", parlementaire: "", amendement: "texte de l'amendement" };

const norm = (s: string) =>
  s
    .replace(/[’‘]/g, "'")
    .replace(/[«»“”"]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/\s*\[…\]\s*$/, "")
    .trim()
    .toLowerCase();

export async function explainVotes(ctx: JobContext, opts?: { limit?: number; uids?: string[] }) {
  const sqlite = getSqlite();
  const pending = sqlite
    .prepare(
      `SELECT d.scrutin_uid AS uid, d.turns, s.chamber, s.date, s.title, s.sort, s.pour, s.contre, s.abstentions, a.summary, a.salience
       FROM scrutin_debates d JOIN scrutins s ON s.uid = d.scrutin_uid LEFT JOIN scrutin_analyses a ON a.scrutin_uid = d.scrutin_uid
       WHERE d.explanation IS NULL ${opts?.uids?.length ? `AND d.scrutin_uid IN (${opts.uids.map(() => "?").join(",")})` : ""}
       ORDER BY COALESCE(a.salience, 2) DESC, s.date DESC LIMIT ?`,
    )
    .all(...(opts?.uids ?? []), opts?.limit ?? DEFAULT_LIMIT) as { uid: string; turns: string; chamber: string; date: string; title: string; sort: string | null; pour: number | null; contre: number | null; abstentions: number | null; summary: string | null; salience: number | null }[];
  const remaining = (sqlite.prepare(`SELECT COUNT(*) n FROM scrutin_debates WHERE explanation IS NULL`).get() as { n: number }).n;
  const model = modelFor("main");
  ctx.log(`${pending.length} votes à expliquer (sur ${remaining} en attente ; moteur ${engine()}, modèle ${model})`);
  if (!pending.length) return;

  const groupsStmt = sqlite.prepare(
    `SELECT gv.group_ref AS groupRef, gv.group_abbrev AS abbrev, gv.position, gv.pour, gv.contre, gv.abstentions, COALESCE(p.name, g.name, gv.group_abbrev) AS name
     FROM group_votes gv LEFT JOIN parties p ON p.id = gv.party_id LEFT JOIN an_groups g ON g.ref = gv.group_ref
     WHERE gv.scrutin_uid = ? AND (gv.pour + gv.contre + gv.abstentions) > 0 ORDER BY COALESCE(p.lr_index, 999)`,
  );
  const save = sqlite.prepare(`UPDATE scrutin_debates SET explanation = ?, explain_model = ?, explained_at = ? WHERE scrutin_uid = ?`);
  let done = 0;
  let failed = 0;
  ctx.setProgress(0, pending.length, "Explication des votes…");

  await pMap(pending, engine() === "claude-code" ? 2 : 4, async (s) => {
    ctx.checkpoint();
    const turns = JSON.parse(s.turns) as DebateTurn[];
    const groups = groupsStmt.all(s.uid) as { groupRef: string; abbrev: string | null; position: string | null; pour: number; contre: number; abstentions: number; name: string | null }[];
    if (!groups.length) return;
    const debate = turns
      .map((t, i) => {
        const who = [t.group, t.role !== "parlementaire" ? t.quality || ROLE_LABEL[t.role] : null].filter(Boolean).join(", ");
        return `[T${i + 1}] ${t.speaker}${who ? ` (${who})` : ""} :\n${t.text}`;
      })
      .join("\n\n");
    const groupLines = groups.map((g) => `[${g.groupRef}] ${g.abbrev ?? ""} — ${g.name ?? ""} : majoritairement ${POS_LABEL[g.position ?? ""] ?? "partagé"} (pour ${g.pour}, contre ${g.contre}, abstention ${g.abstentions})`).join("\n");
    const prompt = `SCRUTIN — ${s.chamber === "AN" ? "Assemblée nationale" : "Sénat"}, ${s.date}
Intitulé officiel : ${s.title}
Résultat : ${s.sort ?? "?"} (pour ${s.pour ?? "?"}, contre ${s.contre ?? "?"}, abstentions ${s.abstentions ?? "?"})${s.summary ? `\nRésumé déjà établi (d'après l'intitulé seul, à corriger si le débat dit autre chose) : ${s.summary}` : ""}

VOTES PAR GROUPE (réponds pour chacun, dans cet ordre) :
${groupLines}

EXTRAIT DU COMPTE RENDU DE LA SÉANCE (jusqu'à la mise aux voix) :
${debate}`;
    const res = await llm({ task: "explain-votes", system: SYSTEM, prompt, schema: VoteExplanationOutput, model: "main", effort: "medium", ctx });
    if (!res.output) {
      failed++;
      ctx.log(`${s.uid} ignoré : ${res.error ?? "sortie vide"}`);
      return;
    }
    const o = res.output;
    const known = new Map(groups.map((g) => [g.groupRef, g]));
    const explanation: VoteExplanation = {
      titre: o.titre.trim() || undefined,
      enjeu: o.enjeu.trim(),
      siAdopte: o.si_adopte.trim() || null,
      piegeQuestion: o.piege_question.trim() || null,
      piege: o.piege_question.trim() ? o.piege_reponse.trim() || null : null,
      argumentsPour: o.arguments_pour.filter(Boolean),
      argumentsContre: o.arguments_contre.filter(Boolean),
      groupes: o.groupes
        .filter((g) => known.has(g.groupe))
        .map((g) => {
          const turn = g.intervention > 0 ? turns[g.intervention - 1] : undefined;
          // Citation vérifiée : elle doit figurer mot pour mot dans l'intervention indiquée, d'un membre du groupe.
          // Seul un député du groupe qui parle en son nom (pas comme rapporteur ni ministre) peut expliquer le vote du groupe.
          const spoke = turns.some((t) => t.groupRef === g.groupe && t.role === "parlementaire");
          const quoteOk = !!(spoke && g.citation && turn && turn.groupRef === g.groupe && turn.role === "parlementaire" && norm(turn.text).includes(norm(g.citation)));
          return {
            groupRef: g.groupe,
            raison: spoke ? g.raison.trim() || null : null,
            citation: quoteOk ? g.citation.trim() : null,
            orateur: quoteOk ? turn!.speaker : null,
            politicianId: quoteOk ? turn!.politicianId : null,
          };
        }),
      fiabilite: o.fiabilite,
    };
    save.run(JSON.stringify(explanation), model, nowIso(), s.uid);
    done++;
    ctx.setProgress(done + failed, pending.length, `Votes expliqués : ${done}/${pending.length} — ${ctx.costUsd().toFixed(2)} $ équiv.`);
  });
  ctx.log(`Explication terminée : ${done} votes${failed ? `, ${failed} en échec (relancer le job)` : ""} — ${ctx.costUsd().toFixed(2)} $ équivalent`);
}
