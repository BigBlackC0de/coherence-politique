import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { themesPromptBlock } from "../config/themes";
import { claude, ANALYST_PERSONA, trackUsage } from "./client";
import { TOOL_DEFS, runTool } from "./tools";
import { engine, modelFor } from "../llm";
import { runClaudeCode } from "../llm/claude-code";

/**
 * « Demander à Cohérence-Politique » : question libre, répondue à partir de la base
 * (scrutins classifiés, positions, programmes, prises de parole) via des outils.
 *  - moteur API : boucle d'outils manuelle, bornée ;
 *  - moteur Claude Code : les mêmes outils exposés par le serveur MCP de Cohérence-Politique.
 */

const SYSTEM = `${ANALYST_PERSONA}

Tu réponds aux questions d'un citoyen à partir de la base Cohérence-Politique (scrutins de l'Assemblée nationale et du Sénat classifiés par thème, positions des partis calculées à partir des votes de groupe, programmes analysés, prises de parole en séance et communiqués analysés).
Utilise les outils pour chercher les faits avant de répondre ; ne réponds jamais de mémoire sur des votes précis.
Explique l'échelle quand tu cites une position : chaque thème est un axe de -1 à +1 dont les pôles sont décrits ci-dessous.
Cite les scrutins avec leur date et leur objet. Si la base ne contient pas l'information, dis-le.
Réponds en français, en Markdown, de façon structurée et concise.

THÈMES :
${themesPromptBlock()}`;

export interface AskResult {
  answer: string;
  toolCalls: { name: string; input: unknown }[];
  costUsd: number;
}

export async function ask(question: string, history: Anthropic.MessageParam[] = []): Promise<AskResult> {
  return engine() === "api" ? askApi(question, history) : askClaudeCode(question, history);
}

/* ---- Moteur API ---- */

const API_TOOLS: Anthropic.Tool[] = TOOL_DEFS.map((t) => ({ name: t.name, description: t.description, strict: true, input_schema: t.input_schema as Anthropic.Tool["input_schema"] }));

async function askApi(question: string, history: Anthropic.MessageParam[]): Promise<AskResult> {
  const model = modelFor("main");
  const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: question }];
  const toolCalls: AskResult["toolCalls"] = [];
  let cost = 0;
  for (let turn = 0; turn < 8; turn++) {
    const res = await claude().messages.create({
      model,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: API_TOOLS,
      messages,
      output_config: { effort: "medium" },
    });
    cost += trackUsage("ask", model, res.usage);
    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason === "refusal") return { answer: "Cohérence-Politique n'a pas pu répondre à cette question (refus du modèle).", toolCalls, costUsd: cost };
    if (res.stop_reason !== "tool_use") {
      const answer = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { answer, toolCalls, costUsd: cost };
    }
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, unknown>;
      toolCalls.push({ name: block.name, input });
      let content: string;
      try {
        content = runTool(block.name, input);
      } catch (e) {
        content = JSON.stringify({ error: (e as Error).message });
      }
      results.push({ type: "tool_result", tool_use_id: block.id, content: content.slice(0, 60000) });
    }
    messages.push({ role: "user", content: results });
  }
  return { answer: "Réponse incomplète (trop d'étapes).", toolCalls, costUsd: cost };
}

/* ---- Moteur Claude Code (outils via MCP) ---- */

export function coherenceMcpConfig() {
  const root = process.cwd();
  return {
    mcpServers: {
      coherence: {
        command: process.execPath,
        args: [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "src", "lib", "mcp", "server.ts")],
        env: { COHERENCE_DB_PATH: process.env.COHERENCE_DB_PATH ?? path.join(root, "data", "coherence.db"), COHERENCE_ROOT: root },
      },
    },
  };
}

async function askClaudeCode(question: string, history: Anthropic.MessageParam[]): Promise<AskResult> {
  const transcript = history
    .map((m) => `${m.role === "user" ? "CITOYEN" : "ASSISTANT"} : ${typeof m.content === "string" ? m.content : ""}`)
    .filter((l) => !l.endsWith(" : "))
    .join("\n\n");
  const prompt = `${transcript ? `Conversation précédente :\n${transcript}\n\n` : ""}Nouvelle question du citoyen : ${question}`;
  const r = await runClaudeCode({
    system: SYSTEM,
    prompt,
    model: modelFor("main"),
    effort: "medium",
    tools: [],
    mcpConfig: coherenceMcpConfig(),
    allowedToolPatterns: ["mcp__coherence__*"],
    maxTurns: 14,
    timeoutMs: 10 * 60 * 1000,
  });
  trackUsage("ask", r.model, r.usage, undefined, r.costUsd);
  const toolCalls = r.toolCalls.map((t) => ({ name: t.name.replace(/^mcp__coherence__/, ""), input: t.input }));
  if (!r.ok) return { answer: `Cohérence-Politique n'a pas pu répondre : ${r.errorMessage ?? "erreur"}`, toolCalls, costUsd: r.costUsd };
  return { answer: r.text, toolCalls, costUsd: r.costUsd };
}
