import ora from "ora";
import { requireKeys } from "../config.ts";
import { retrieve } from "../retrieval/pipeline.ts";
import { keywordSearch } from "../db/client.ts";
import { getSystemPrompt } from "../prompts.ts";
import { streamResponse } from "../stream.ts";
import { logQuery } from "../db/client.ts";
import type { RetrievedChunk } from "../parsers/types.ts";

export async function explainCommand(
  name: string,
  options: { codebase?: string }
): Promise<void> {
  const { openaiKey, anthropicKey } = requireKeys();
  const codebase = options.codebase === "all" ? undefined : options.codebase;
  const start = Date.now();

  const spinner = ora(`Searching for ${name}...`).start();

  // Try exact keyword search first
  let chunks: RetrievedChunk[] = await keywordSearch(name, 5, codebase);

  // Supplement with vector search
  const vectorChunks = await retrieve(
    `explain ${name} function subroutine`,
    openaiKey,
    anthropicKey,
    codebase
  );

  // Merge, prioritizing exact matches
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

  const primary = chunks[0]!;
  spinner.succeed(
    `Found ${name} in ${primary.codebase_id.toUpperCase()} (${primary.file_path}:${primary.line_start}-${primary.line_end})`
  );

  const systemPrompt = getSystemPrompt("explain", options.codebase);
  await streamResponse(
    `Explain the function/subroutine "${name}" in detail`,
    systemPrompt,
    chunks,
    anthropicKey
  );

  await logQuery({
    command: "explain",
    query_text: name,
    codebase_filter: options.codebase,
    chunks_retrieved: chunks.length,
    latency_ms: Date.now() - start,
  }).catch(() => {});
}
