import ora from "ora";
import { requireKeys } from "../config.ts";
import { retrieve } from "../retrieval/pipeline.ts";
import { keywordSearch } from "../db/client.ts";
import { getSystemPrompt } from "../prompts.ts";
import { streamResponse } from "../stream.ts";
import { logQuery } from "../db/client.ts";
import type { RetrievedChunk } from "../parsers/types.ts";

export async function docsCommand(
  name: string,
  options: { codebase?: string }
): Promise<void> {
  const { openaiKey, anthropicKey } = requireKeys();
  const codebase = options.codebase === "all" ? undefined : options.codebase;
  const start = Date.now();

  const spinner = ora(`Generating documentation for ${name}...`).start();

  // Keyword search for exact match + vector for context
  let chunks: RetrievedChunk[] = await keywordSearch(name, 3, codebase);

  const vectorChunks = await retrieve(
    `documentation for ${name} function parameters return values`,
    openaiKey,
    anthropicKey,
    codebase,
    5
  );

  const seen = new Set(chunks.map((c) => c.id));
  for (const vc of vectorChunks) {
    if (!seen.has(vc.id)) {
      chunks.push(vc);
      seen.add(vc.id);
    }
  }
  chunks = chunks.slice(0, 7);

  if (chunks.length === 0) {
    spinner.fail(`Could not find ${name}`);
    return;
  }

  spinner.succeed(`Generated docs for ${name}`);

  const systemPrompt = getSystemPrompt("docs", options.codebase);
  await streamResponse(
    `Generate comprehensive markdown documentation for "${name}". Include signature, parameters, return values, example usage, and related functions.`,
    systemPrompt,
    chunks,
    anthropicKey
  );

  await logQuery({
    command: "docs",
    query_text: name,
    codebase_filter: options.codebase,
    chunks_retrieved: chunks.length,
    latency_ms: Date.now() - start,
  }).catch(() => {});
}
