create extension if not exists vector;
create extension if not exists pg_trgm;

create table code_chunks (
  id uuid primary key default gen_random_uuid(),
  codebase_id text not null,
  file_path text not null,
  chunk_name text not null,
  chunk_type text not null,
  source_code text not null,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  line_start int,
  line_end int,
  language text not null,
  created_at timestamptz default now()
);

create index code_chunks_embedding_idx on code_chunks
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
create index code_chunks_codebase_idx on code_chunks (codebase_id);
create index code_chunks_name_trgm_idx on code_chunks using gin (chunk_name gin_trgm_ops);
create index code_chunks_metadata_idx on code_chunks using gin (metadata);

create or replace function match_code_chunks(
  query_embedding vector(1536),
  match_count int default 10,
  filter_codebase text default null
) returns table (
  id uuid, codebase_id text, file_path text, chunk_name text,
  chunk_type text, source_code text, metadata jsonb,
  line_start int, line_end int, language text, similarity float
) language plpgsql as $$
begin
  return query
    select cc.id, cc.codebase_id, cc.file_path, cc.chunk_name,
           cc.chunk_type, cc.source_code, cc.metadata,
           cc.line_start, cc.line_end, cc.language,
           1 - (cc.embedding <=> query_embedding) as similarity
    from code_chunks cc
    where (filter_codebase is null or cc.codebase_id = filter_codebase)
    order by cc.embedding <=> query_embedding
    limit match_count;
end;
$$;

create or replace function keyword_search_chunks(
  search_query text,
  match_count int default 10,
  filter_codebase text default null
) returns table (
  id uuid, codebase_id text, file_path text, chunk_name text,
  chunk_type text, source_code text, metadata jsonb,
  line_start int, line_end int, language text, rank real
) language plpgsql as $$
begin
  return query
    select cc.id, cc.codebase_id, cc.file_path, cc.chunk_name,
           cc.chunk_type, cc.source_code, cc.metadata,
           cc.line_start, cc.line_end, cc.language,
           ts_rank(
             to_tsvector('english', cc.chunk_name || ' ' || cc.source_code),
             plainto_tsquery('english', search_query)
           ) as rank
    from code_chunks cc
    where (filter_codebase is null or cc.codebase_id = filter_codebase)
      and to_tsvector('english', cc.chunk_name || ' ' || cc.source_code)
          @@ plainto_tsquery('english', search_query)
    order by rank desc
    limit match_count;
end;
$$;

create table query_logs (
  id uuid primary key default gen_random_uuid(),
  command text not null,
  query_text text not null,
  codebase_filter text,
  chunks_retrieved int,
  latency_ms int,
  created_at timestamptz default now()
);
