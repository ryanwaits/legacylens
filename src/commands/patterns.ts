import ora from "ora";
import { requireKeys } from "../config.ts";
import { retrieve } from "../retrieval/pipeline.ts";
import { getSystemPrompt } from "../prompts.ts";
import { streamResponse, printVerboseStats, MODELS } from "../stream.ts";
import { logQuery } from "../db/client.ts";

export async function patternsCommand(
  description: string,
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

  const spinner = ora("Searching for patterns across codebases...").start();

  // Search with more results for pattern detection
  const chunks = await retrieve(
    `${description} pattern convention`,
    {
      openaiKey,
      anthropicKey,
      codebase,
      topK: 8,
      noRerank,
      rerankModel: fast ? MODELS.fast : undefined,
    }
  );

  if (chunks.length === 0) {
    spinner.fail("No patterns found matching that description");
    return;
  }

  const retrievalMs = Date.now() - start;
  spinner.succeed(`Found ${chunks.length} relevant chunks`);

  const systemPrompt = getSystemPrompt("patterns", options.codebase);
  const result = await streamResponse(
    `Identify distinct architectural/design patterns related to "${description}" in the provided code chunks. Look for conventions, repeated approaches, and idioms.`,
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
    command: "patterns",
    query_text: description,
    codebase_filter: options.codebase,
    chunks_retrieved: chunks.length,
    latency_ms: totalMs,
  }).catch(() => {});
}
