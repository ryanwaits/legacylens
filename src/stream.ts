import Anthropic from "@anthropic-ai/sdk";
import chalk from "chalk";
import ora from "ora";
import type { RetrievedChunk } from "./parsers/types.ts";
import { renderMarkdown } from "./render.ts";

export async function streamResponse(
  query: string,
  systemPrompt: string,
  chunks: RetrievedChunk[],
  anthropicKey: string
): Promise<string> {
  const client = new Anthropic({ apiKey: anthropicKey });

  const contextBlock = chunks
    .map(
      (c) =>
        `--- ${c.chunk_name} (${c.file_path}:${c.line_start}-${c.line_end}) ---\n${c.source_code}`
    )
    .join("\n\n");

  const userMessage = `Here are the relevant code chunks:\n\n${contextBlock}\n\nQuery: ${query}`;

  const spinner = ora("Generating response...").start();

  let fullText = "";

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      fullText += event.delta.text;
    }
  }

  spinner.stop();

  process.stdout.write(renderMarkdown(fullText));

  // Citations footer with relevance scores
  process.stdout.write(chalk.dim("📎 Sources:\n"));
  for (const c of chunks) {
    const score = c.score != null ? chalk.dim(` [${c.score.toFixed(1)}/10]`) : "";
    process.stdout.write(
      chalk.dim(`   • ${c.file_path}:${c.line_start}-${c.line_end}`) + score + "\n"
    );
  }

  return fullText;
}
