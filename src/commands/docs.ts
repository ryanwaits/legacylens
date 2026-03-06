import ora from "ora";
import { requireKeys } from "../config.ts";
import { retrieve } from "../retrieval/pipeline.ts";
import { keywordSearch } from "../db/client.ts";
import { getSystemPrompt } from "../prompts.ts";
import { streamResponse, printVerboseStats, MODELS } from "../stream.ts";
import { logQuery } from "../db/client.ts";
import type { RetrievedChunk } from "../parsers/types.ts";

export async function docsCommand(
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

  const spinner = ora(`Generating documentation for ${name}...`).start();

  // Keyword search for exact match + vector for context
  let chunks: RetrievedChunk[] = await keywordSearch(name, 3, codebase);

  const vectorChunks = await retrieve(
    `documentation for ${name} function parameters return values`,
    {
      openaiKey,
      anthropicKey,
      codebase,
      topK: 5,
      noRerank,
      rerankModel: fast ? MODELS.fast : undefined,
    }
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

  const retrievalMs = Date.now() - start;
  spinner.succeed(`Generated docs for ${name}`);

  const systemPrompt = getSystemPrompt("docs", options.codebase);
  const result = await streamResponse(
    `Generate comprehensive markdown documentation for "${name}". Include signature, parameters, return values, example usage, and related functions.`,
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
    command: "docs",
    query_text: name,
    codebase_filter: options.codebase,
    chunks_retrieved: chunks.length,
    latency_ms: totalMs,
  }).catch(() => {});
}
