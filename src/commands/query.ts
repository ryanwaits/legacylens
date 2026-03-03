import ora from "ora";
import { requireKeys } from "../config.ts";
import { retrieve } from "../retrieval/pipeline.ts";
import { getSystemPrompt } from "../prompts.ts";
import { streamResponse } from "../stream.ts";
import { logQuery } from "../db/client.ts";

export async function queryCommand(
  question: string,
  options: { codebase?: string }
): Promise<void> {
  const { openaiKey, anthropicKey } = requireKeys();
  const codebase = options.codebase === "all" ? undefined : options.codebase;
  const start = Date.now();

  const spinner = ora("Searching codebases...").start();

  const chunks = await retrieve(question, openaiKey, anthropicKey, codebase);

  if (chunks.length === 0) {
    spinner.fail("No relevant code found");
    return;
  }

  spinner.succeed(`Retrieved ${chunks.length} relevant chunks`);

  const systemPrompt = getSystemPrompt("query", options.codebase);
  await streamResponse(question, systemPrompt, chunks, anthropicKey);

  await logQuery({
    command: "query",
    query_text: question,
    codebase_filter: options.codebase,
    chunks_retrieved: chunks.length,
    latency_ms: Date.now() - start,
  }).catch(() => {});
}
