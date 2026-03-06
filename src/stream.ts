import Anthropic from "@anthropic-ai/sdk";
import chalk from "chalk";
import type { RetrievedChunk } from "./parsers/types.ts";
import { renderMarkdown } from "./render.ts";

export const MODELS = {
  default: "claude-sonnet-4-20250514",
  fast: "claude-haiku-4-5-20251001",
} as const;

export interface StreamOptions {
  anthropicKey: string;
  model?: string;
  maxTokens?: number;
}

export interface StreamResult {
  text: string;
  model: string;
  timeToFirstToken: number;
  totalTime: number;
  inputTokens: number;
  outputTokens: number;
}

export async function streamResponse(
  query: string,
  systemPrompt: string,
  chunks: RetrievedChunk[],
  options: StreamOptions
): Promise<StreamResult> {
  const { anthropicKey, model = MODELS.default, maxTokens = 4096 } = options;
  const client = new Anthropic({ apiKey: anthropicKey });

  const contextBlock = chunks
    .map(
      (c) =>
        `--- ${c.chunk_name} (${c.file_path}:${c.line_start}-${c.line_end}) ---\n${c.source_code}`
    )
    .join("\n\n");

  const userMessage = `Here are the relevant code chunks:\n\n${contextBlock}\n\nQuery: ${query}`;

  const isTTY = process.stdout.isTTY;

  let fullText = "";
  let firstToken = true;
  let timeToFirstToken = 0;
  const streamStart = Date.now();

  if (isTTY) {
    process.stderr.write(chalk.dim("Thinking..."));
  }

  const stream = await client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      if (firstToken) {
        timeToFirstToken = Date.now() - streamStart;
        if (isTTY) {
          process.stderr.write("\r" + " ".repeat(20) + "\r");
        }
        firstToken = false;
      }

      fullText += event.delta.text;

      if (isTTY) {
        process.stdout.write(event.delta.text);
      }
    }
  }

  const totalTime = Date.now() - streamStart;

  // Get usage from final message
  const finalMessage = await stream.finalMessage();
  const inputTokens = finalMessage.usage?.input_tokens ?? 0;
  const outputTokens = finalMessage.usage?.output_tokens ?? 0;

  if (isTTY) {
    if (firstToken) {
      process.stderr.write("\r" + " ".repeat(20) + "\r");
    }
    process.stdout.write("\n\n");
  } else {
    process.stdout.write(renderMarkdown(fullText));
  }

  // Citations footer
  process.stdout.write(chalk.dim("📎 Sources:\n"));
  for (const c of chunks) {
    const score = c.score != null ? chalk.dim(` [${c.score.toFixed(1)}/10]`) : "";
    process.stdout.write(
      chalk.dim(`   • ${c.file_path}:${c.line_start}-${c.line_end}`) + score + "\n"
    );
  }

  return { text: fullText, model, timeToFirstToken, totalTime, inputTokens, outputTokens };
}

export function printVerboseStats(
  result: StreamResult,
  retrievalMs: number,
  totalMs: number,
  chunks: number,
  flags: { fast?: boolean; noRerank?: boolean }
): void {
  const lines = [
    "",
    chalk.dim("─".repeat(50)),
    chalk.dim.bold("Stats"),
    chalk.dim(`  Model:            ${result.model}`),
    chalk.dim(`  Retrieval:        ${retrievalMs}ms (${chunks} chunks)`),
    chalk.dim(`  First token:      ${result.timeToFirstToken}ms`),
    chalk.dim(`  Generation:       ${result.totalTime}ms`),
    chalk.dim(`  Total:            ${totalMs}ms`),
    chalk.dim(`  Tokens:           ${result.inputTokens} in / ${result.outputTokens} out`),
  ];

  const activeFlags: string[] = [];
  if (flags.fast) activeFlags.push("--fast");
  if (flags.noRerank) activeFlags.push("--no-rerank");
  if (activeFlags.length > 0) {
    lines.push(chalk.dim(`  Flags:            ${activeFlags.join(", ")}`));
  }

  lines.push(chalk.dim("─".repeat(50)));
  process.stderr.write(lines.join("\n") + "\n");
}
