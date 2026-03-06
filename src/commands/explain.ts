import ora from "ora";
import { requireKeys } from "../config.ts";
import { retrieve } from "../retrieval/pipeline.ts";
import { keywordSearch } from "../db/client.ts";
import { getSystemPrompt } from "../prompts.ts";
import { streamResponse, printVerboseStats, MODELS } from "../stream.ts";
import { logQuery } from "../db/client.ts";
import type { RetrievedChunk } from "../parsers/types.ts";

export async function explainCommand(
  name: string,
  options: { codebase?: string },
  command: { parent: { opts(): { fast?: boolean; rerank?: boolean; verbose?: boolean } } }
): Promise<void> {
  const { openaiKey, anthropicKey } = requireKeys();
  const codebase = options.codebase === "all" ? undefined : options.codebase;
  const globalOpts = command.parent.opts();
  const fast = globalOpts.fast ?? false;
  const noRerank = globalOpts.rerank === false;
  const verbose = globalOpts.verbose ?? false;
  const start = Date.now();

  const spinner = ora(`Searching for ${name}...`).start();

  // Try exact keyword search first
  let chunks: RetrievedChunk[] = await keywordSearch(name, 5, codebase);

  // Supplement with vector search
  const vectorChunks = await retrieve(
    `explain ${name} function subroutine`,
    {
      openaiKey,
      anthropicKey,
      codebase,
      noRerank,
      rerankModel: fast ? MODELS.fast : undefined,
    }
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

  const retrievalMs = Date.now() - start;
  const primary = chunks[0]!;
  spinner.succeed(
    `Found ${name} in ${primary.codebase_id.toUpperCase()} (${primary.file_path}:${primary.line_start}-${primary.line_end})`
  );

  const systemPrompt = getSystemPrompt("explain", options.codebase);
  const result = await streamResponse(
    `Explain the function/subroutine "${name}" in detail`,
    systemPrompt,
    chunks,
    {
      anthropicKey,
      model: fast ? MODELS.fast : undefined,
      maxTokens: fast ? 2048 : undefined,
    }
  );

  const totalMs = Date.now() - start;

  if (verbose) {
    printVerboseStats(result, retrievalMs, totalMs, chunks.length, { fast, noRerank });
  }

  await logQuery({
    command: "explain",
    query_text: name,
    codebase_filter: options.codebase,
    chunks_retrieved: chunks.length,
    latency_ms: totalMs,
  }).catch(() => {});
}
