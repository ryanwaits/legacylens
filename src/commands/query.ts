import ora from "ora";
import { requireKeys } from "../config.ts";
import { retrieve } from "../retrieval/pipeline.ts";
import { getSystemPrompt } from "../prompts.ts";
import { streamResponse, printVerboseStats, MODELS } from "../stream.ts";
import { logQuery } from "../db/client.ts";

export async function queryCommand(
  question: string,
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

  const spinner = ora("Searching codebases...").start();

  const chunks = await retrieve(question, {
    openaiKey,
    anthropicKey,
    codebase,
    noRerank,
    rerankModel: fast ? MODELS.fast : undefined,
  });

  if (chunks.length === 0) {
    spinner.fail("No relevant code found");
    return;
  }

  const retrievalMs = Date.now() - start;
  spinner.succeed(`Retrieved ${chunks.length} relevant chunks`);

  const systemPrompt = getSystemPrompt("query", options.codebase);
  const result = await streamResponse(question, systemPrompt, chunks, {
    anthropicKey,
    model: fast ? MODELS.fast : undefined,
    maxTokens: fast ? 2048 : undefined,
  });

  const totalMs = Date.now() - start;

  if (verbose) {
    printVerboseStats(result, retrievalMs, totalMs, chunks.length, { fast, noRerank });
  }

  await logQuery({
    command: "query",
    query_text: question,
    codebase_filter: options.codebase,
    chunks_retrieved: chunks.length,
    latency_ms: totalMs,
  }).catch(() => {});
}
