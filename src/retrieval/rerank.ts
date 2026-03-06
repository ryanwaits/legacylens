import Anthropic from "@anthropic-ai/sdk";
import type { RetrievedChunk } from "../parsers/types.ts";

export async function rerank(
  query: string,
  chunks: RetrievedChunk[],
  topK: number,
  apiKey: string,
  model?: string
): Promise<RetrievedChunk[]> {
  if (chunks.length <= topK) return chunks;

  // Cap rerank input at 10 chunks
  chunks = chunks.slice(0, 10);

  const client = new Anthropic({ apiKey });

  const chunkSummaries = chunks.map((c, i) => ({
    index: i,
    name: c.chunk_name,
    file: c.file_path,
    type: c.chunk_type,
    preview: c.source_code.slice(0, 500),
  }));

  try {
    const response = await client.messages.create({
      model: model || "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Rate the relevance of each code chunk to this query: "${query}"

Chunks:
${JSON.stringify(chunkSummaries, null, 2)}

Return ONLY a JSON array of objects with "index" and "score" (0-10) fields, sorted by score descending. No explanation.`,
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return chunks.slice(0, topK);

    const scores = JSON.parse(jsonMatch[0]) as { index: number; score: number }[];
    const sorted = scores
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return sorted
      .map((s) => {
        const chunk = chunks[s.index];
        if (!chunk) return null;
        return { ...chunk, score: s.score } as RetrievedChunk;
      })
      .filter((c): c is RetrievedChunk => c !== null);
  } catch {
    // Fallback: return original order
    return chunks.slice(0, topK);
  }
}
