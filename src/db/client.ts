import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY } from "../config.ts";
import type { CodeChunkInsert, RetrievedChunk } from "../parsers/types.ts";

let _client: SupabaseClient | null = null;
let _adminClient: SupabaseClient | null = null;

// Read-only client (publishable key) — used for queries
export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _client;
}

// Admin client (secret key) — used for ingestion writes
export function getAdminSupabase(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }
  return _adminClient;
}

export async function upsertChunks(chunks: CodeChunkInsert[]): Promise<void> {
  const db = getAdminSupabase();
  const batchSize = 50;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const { error } = await db.from("code_chunks").upsert(batch, {
      onConflict: "codebase_id,file_path,chunk_name",
      ignoreDuplicates: false,
    });
    if (error) throw new Error(`Upsert failed: ${error.message}`);
  }
}

export async function insertChunks(chunks: CodeChunkInsert[]): Promise<void> {
  const db = getAdminSupabase();
  const batchSize = 50;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const { error } = await db.from("code_chunks").insert(batch);
    if (error) throw new Error(`Insert failed: ${error.message}`);
  }
}

export async function vectorSearch(
  embedding: number[],
  count: number = 10,
  codebase?: string
): Promise<RetrievedChunk[]> {
  const db = getSupabase();
  const { data, error } = await db.rpc("match_code_chunks", {
    query_embedding: embedding,
    match_count: count,
    filter_codebase: codebase || null,
  });
  if (error) throw new Error(`Vector search failed: ${error.message}`);
  return (data || []) as RetrievedChunk[];
}

export async function keywordSearch(
  query: string,
  count: number = 10,
  codebase?: string
): Promise<RetrievedChunk[]> {
  const db = getSupabase();
  const { data, error } = await db.rpc("keyword_search_chunks", {
    search_query: query,
    match_count: count,
    filter_codebase: codebase || null,
  });
  if (error) throw new Error(`Keyword search failed: ${error.message}`);
  return (data || []) as RetrievedChunk[];
}

export async function logQuery(params: {
  command: string;
  query_text: string;
  codebase_filter?: string;
  chunks_retrieved: number;
  latency_ms: number;
}): Promise<void> {
  if (!SUPABASE_SERVICE_KEY) return;
  const db = getAdminSupabase();
  await db.from("query_logs").insert(params);
}

export async function clearCodebase(codebaseId: string): Promise<void> {
  const db = getAdminSupabase();
  const { error } = await db
    .from("code_chunks")
    .delete()
    .eq("codebase_id", codebaseId);
  if (error) throw new Error(`Clear failed: ${error.message}`);
}
