import ora from "ora";
import { requireKeys } from "../config.ts";
import { retrieve } from "../retrieval/pipeline.ts";
import { getSystemPrompt } from "../prompts.ts";
import { streamResponse } from "../stream.ts";
import { logQuery } from "../db/client.ts";

export async function patternsCommand(
  description: string,
  options: { codebase?: string }
): Promise<void> {
  const { openaiKey, anthropicKey } = requireKeys();
  const codebase = options.codebase === "all" ? undefined : options.codebase;
  const start = Date.now();

  const spinner = ora("Searching for patterns across codebases...").start();

  // Search with more results for pattern detection
  const chunks = await retrieve(
    `${description} pattern convention`,
    openaiKey,
    anthropicKey,
    codebase,
    8
  );

  if (chunks.length === 0) {
    spinner.fail("No patterns found matching that description");
    return;
  }

  spinner.succeed(`Found ${chunks.length} relevant chunks`);

  const systemPrompt = getSystemPrompt("patterns", options.codebase);
  await streamResponse(
    `Identify distinct architectural/design patterns related to "${description}" in the provided code chunks. Look for conventions, repeated approaches, and idioms.`,
    systemPrompt,
    chunks,
    anthropicKey
  );

  await logQuery({
    command: "patterns",
    query_text: description,
    codebase_filter: options.codebase,
    chunks_retrieved: chunks.length,
    latency_ms: Date.now() - start,
  }).catch(() => {});
}
