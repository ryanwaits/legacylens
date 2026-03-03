# RAG Architecture — LegacyLens

## Vector DB Selection

**Choice: Supabase (pgvector)**

We chose pgvector on Supabase over Pinecone, Weaviate, and ChromaDB for three reasons:

1. **Hybrid search in one database** — Legacy code queries mix natural language ("how does error handling work") with exact identifiers ("DGESV", "CFE_ES_Main"). pgvector gives us vector similarity search alongside Postgres full-text keyword search in a single query layer. Pinecone lacks native keyword search; Weaviate adds GraphQL complexity.

2. **SQL-native metadata filtering** — Every chunk carries file path, line numbers, function name, and codebase ID. Standard SQL `WHERE` clauses filter these without learning a custom query DSL.

3. **Zero cost at demo scale** — Supabase free tier provides 500MB storage. Our LAPACK + cFS embeddings total ~50MB. No infrastructure to manage.

**Tradeoff**: pgvector's IVFFlat/HNSW indexing is slower than Pinecone at 100K+ vectors. Acceptable for our ~2,000 chunk dataset.

## Embedding Strategy

**Choice: OpenAI text-embedding-3-small (1536 dimensions)**

- **Cost**: $0.02/1M tokens. Full LAPACK ingestion costs ~$0.50.
- **Quality**: Strong performance on code understanding tasks despite being general-purpose. Voyage Code 2 offers marginal improvement on Fortran but adds a second API vendor.
- **Dimensions**: 1536d balances quality and storage. 3072d (text-embedding-3-large) doubles storage cost with diminishing returns at our scale.

Same model is used for both ingestion and query embedding to ensure vector space consistency.

## Chunking Approach

**Primary: Syntax-aware, function-level splitting**

Fortran and C have natural chunk boundaries that we exploit:

- **Fortran parser** (`src/parsers/fortran.ts`): Detects `SUBROUTINE name(args)` ... `END` blocks. Preserves leading comments (which document the routine). Extracts `CALL` statements as dependency metadata.
- **C parser** (`src/parsers/c.ts`): Detects function definitions via brace-matching. Extracts `CFE_*` API calls for NASA cFS dependency tracking.
- **Fallback**: Files without clear function boundaries get fixed-size chunking (500 tokens, 50 token overlap).

**Metadata preserved per chunk**: file path, line start/end, function name, called functions list, codebase ID.

**Result**: ~1,500 chunks for LAPACK, ~500 for cFS. Each chunk is a self-contained logical unit.

## Retrieval Pipeline

```
User Query
    ↓
Embed query (text-embedding-3-small)
    ↓
┌──────────────────────────────┐
│  Parallel Search             │
│  ├─ Vector similarity → 10  │
│  └─ Keyword search   → 10  │
└──────────────────────────────┘
    ↓
Merge + deduplicate (boost chunks found in both)
    ↓
LLM Re-rank (Claude scores each chunk 0-10)
    ↓
Top 5 chunks → Context assembly
    ↓
Claude Sonnet → Streaming answer with citations
```

**Hybrid scoring**: Vector results get `similarity` score. Keyword results get `rank * 10`. Chunks appearing in both searches receive a `rank * 5` boost. This ensures exact function name matches rank highly even if their vector similarity is moderate.

**Re-ranking**: Claude rates each candidate chunk's relevance to the query on a 0-10 scale. This catches semantic mismatches that vector similarity misses (e.g., a chunk mentioning "DGESV" in a comment vs. the actual DGESV implementation).

## Failure Modes

| Failure | Observed Behavior | Mitigation |
|---------|-------------------|------------|
| **No relevant results** | Hybrid search returns empty | CLI reports "No relevant code found" and exits gracefully |
| **Ambiguous queries** | Low-scoring chunks returned | Re-ranker filters noise; scores displayed to user for transparency |
| **Function name typos** | Keyword search misses, vector search may still find related chunks | Hybrid approach provides resilience — vector catches semantic similarity |
| **Large subroutines** | Some LAPACK routines exceed 500 lines | Chunk includes full source; embedding truncates at model's 8K token limit. Leading comments preserved. |
| **Cross-codebase confusion** | Queries without `--codebase` flag mix LAPACK and cFS results | `--codebase` filter restricts search. Default `all` is intentional for cross-codebase pattern queries. |
| **Re-ranker parse failure** | Claude returns malformed JSON | Falls back to original vector+keyword score ordering |

## Performance Results

Measured on LAPACK queries (MacBook Pro, Supabase free tier):

| Metric | Target | Actual |
|--------|--------|--------|
| Query latency (end-to-end) | <3s | ~2-5s (retrieval <1s, generation 1-4s) |
| Retrieval precision (top-5) | >70% | ~80% on test queries (manual evaluation) |
| Codebase coverage | 100% files indexed | 100% of LAPACK SRC + cFS core |
| Ingestion throughput | 10K+ LOC in <5 min | ~250K LOC in ~3 min |
| Answer accuracy | Correct file/line refs | Correct on all tested queries |

**Example queries tested**:
- "What does DGESV do?" → Correctly identifies linear system solver, cites `SRC/dgesv.f`
- "What are the dependencies of DGETRF?" → Returns DGETF2, DLASWP, DTRSM, DGEMM with file paths
- "Show me error handling patterns in LAPACK" → Finds XERBLA pattern, INFO parameter checks
- "How does cFS handle app startup?" → Traces CFE_ES_Main initialization flow
