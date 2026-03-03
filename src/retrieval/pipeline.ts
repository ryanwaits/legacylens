import { vectorSearch, keywordSearch } from "../db/client.ts";
import { embedSingle } from "../ingestion/embed.ts";
import { rerank } from "./rerank.ts";
import type { RetrievedChunk } from "../parsers/types.ts";

export async function retrieve(
  query: string,
  openaiKey: string,
  anthropicKey: string,
  codebase?: string,
  topK: number = 5
): Promise<RetrievedChunk[]> {
  // Embed query
  const queryEmbedding = await embedSingle(query, openaiKey);

  // Parallel search: vector + keyword
  const [vectorResults, keywordResults] = await Promise.all([
    vectorSearch(queryEmbedding, 10, codebase),
    keywordSearch(query, 10, codebase),
  ]);

  // Merge + dedup by id
  const seen = new Map<string, RetrievedChunk>();

  for (const chunk of vectorResults) {
    seen.set(chunk.id, { ...chunk, score: chunk.similarity || 0 });
  }

  for (const chunk of keywordResults) {
    if (!seen.has(chunk.id)) {
      seen.set(chunk.id, { ...chunk, score: (chunk.rank || 0) * 10 });
    } else {
      // Boost chunks found in both
      const existing = seen.get(chunk.id)!;
      existing.score = (existing.score || 0) + (chunk.rank || 0) * 5;
    }
  }

  const merged = [...seen.values()].sort(
    (a, b) => (b.score || 0) - (a.score || 0)
  );

  // LLM rerank
  const reranked = await rerank(query, merged, topK, anthropicKey);

  return reranked;
}
