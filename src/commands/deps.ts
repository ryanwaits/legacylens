import ora from "ora";
import { requireKeys } from "../config.ts";
import { retrieve } from "../retrieval/pipeline.ts";
import { keywordSearch } from "../db/client.ts";
import { getSystemPrompt } from "../prompts.ts";
import { streamResponse } from "../stream.ts";
import { logQuery } from "../db/client.ts";
import type { RetrievedChunk } from "../parsers/types.ts";

export async function depsCommand(
  name: string,
  options: { codebase?: string }
): Promise<void> {
  const { openaiKey, anthropicKey } = requireKeys();
  const codebase = options.codebase === "all" ? undefined : options.codebase;
  const start = Date.now();

  const spinner = ora(`Mapping dependencies for ${name}...`).start();

  // Find the target function
  const directResults = await keywordSearch(name, 3, codebase);
  const primary = directResults[0];

  if (!primary) {
    spinner.fail(`Could not find ${name}`);
    return;
  }

  // Extract called functions from metadata
  const calledFunctions =
    (primary.metadata as Record<string, unknown>)?.calledFunctions;
  const deps: string[] = Array.isArray(calledFunctions)
    ? (calledFunctions as string[])
    : [];

  // Look up each dependency
  const depChunks: RetrievedChunk[] = [primary];
  for (const dep of deps.slice(0, 10)) {
    const results = await keywordSearch(dep, 1, codebase);
    if (results.length > 0) {
      depChunks.push(results[0]!);
    }
  }

  // Also get vector-searched related chunks
  const vectorChunks = await retrieve(
    `dependencies and call graph of ${name}`,
    openaiKey,
    anthropicKey,
    codebase,
    5
  );

  const seen = new Set(depChunks.map((c) => c.id));
  for (const vc of vectorChunks) {
    if (!seen.has(vc.id)) {
      depChunks.push(vc);
      seen.add(vc.id);
    }
  }

  spinner.succeed(`Found ${depChunks.length - 1} dependencies for ${name}`);

  const systemPrompt = getSystemPrompt("deps", options.codebase);
  await streamResponse(
    `Map the dependency tree and call graph for "${name}". Show what it calls and what calls it.`,
    systemPrompt,
    depChunks,
    anthropicKey
  );

  await logQuery({
    command: "deps",
    query_text: name,
    codebase_filter: options.codebase,
    chunks_retrieved: depChunks.length,
    latency_ms: Date.now() - start,
  }).catch(() => {});
}
