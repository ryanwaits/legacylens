import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient(apiKey: string): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

export function formatEmbeddingText(
  type: string,
  name: string,
  comments: string | undefined,
  source: string
): string {
  const lines = source.split("\n").slice(0, 200).join("\n");
  let text = `[${type}] ${name}\n`;
  if (comments) text += `${comments}\n`;
  text += lines;
  // Truncate to ~8000 tokens (~32000 chars)
  return text.slice(0, 32000);
}

export async function embedBatch(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  const client = getClient(apiKey);
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });
    for (const item of response.data) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

export async function embedSingle(
  text: string,
  apiKey: string
): Promise<number[]> {
  const client = getClient(apiKey);
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0]!.embedding;
}
