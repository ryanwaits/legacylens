# LegacyLens Pre-Search Document

**Date:** 2026-03-02
**Author:** Ryan Waits
**Project:** RAG System for Legacy Enterprise Codebases

---

## Phase 1: Define Your Constraints

### 1. Scale & Load Profile

| Dimension | Decision | Rationale |
|-----------|----------|-----------|
| **Target Codebase** | LAPACK (Fortran) | ~250K LOC, 1000+ files. BSD-licensed linear algebra library used by DOE national labs (Los Alamos, Sandia, Oak Ridge), NASA, and NOAA. Well-structured subroutines make natural chunk boundaries. |
| **Query Volume** | Demo-only (~10/day) | Sprint project with interview demo as primary use case. No production traffic. |
| **Ingestion Model** | Batch + incremental | Initial full ingestion of LAPACK repo, with ability to add new files or re-index changed files. |
| **Latency Target** | <3s end-to-end | Per PRD requirements. Retrieval <1s, LLM generation fills remainder. |

**Codebase stats (estimated):**
- ~250,000 LOC across 1,000+ Fortran source files
- Subroutines for eigenvalue problems, SVD, linear systems, least squares
- Well-documented with inline comments describing mathematical operations
- Clear SUBROUTINE/FUNCTION boundaries ideal for chunking

### 2. Budget & Cost Ceiling

| Category | Approach | Estimated Cost |
|----------|----------|---------------|
| **Embeddings** | OpenAI text-embedding-3-small API | ~$0.50 (250K LOC ≈ 25M tokens × $0.02/1M) |
| **Vector DB** | Supabase free tier (pgvector) | $0 |
| **LLM (answer gen)** | Claude API | ~$5-10 for dev + demo |
| **Hosting** | npm (CLI package, publicly accessible) | $0 |
| **Total ceiling** | — | **~$10-15** |

**Tradeoff:** Pay for embedding quality (OpenAI API) and LLM quality (Claude), use free tiers for infrastructure. Embedding cost is negligible for this codebase size.

### 3. Time to Ship

| Milestone | Deadline | Scope |
|-----------|----------|-------|
| **Pre-Search** | Now (30 min) | This document |
| **MVP** | Tomorrow (24h) | Basic RAG pipeline: ingest → embed → store → query → answer |
| **Final** | Sunday 10:59 PM CT | Polish, 4 features, docs, npm publish |

**Must-have features (4 required):**
1. Code Explanation — explain what a subroutine does in plain English
2. Dependency Mapping — show call graphs and data flow between modules
3. Pattern Detection — find similar code patterns across the codebase
4. Documentation Generation — generate docs for undocumented code

**Nice-to-have:** Translation hints (Fortran → modern language), impact analysis

**Framework learning curve:** Minimal — comfortable with pgvector and OpenAI embeddings. Building custom pipeline (no LangChain/LlamaIndex), so no framework ramp-up needed.

### 4. Data Sensitivity

| Question | Answer |
|----------|--------|
| Open source or proprietary? | **Open source** — LAPACK is BSD-licensed |
| Can code be sent to external APIs? | **Yes** — no restrictions on open source code |
| Data residency requirements? | **None** — open source, no PII, no compliance constraints |

### 5. Team & Skill Constraints

| Dimension | Status |
|-----------|--------|
| **Team size** | Solo |
| **Vector DB experience** | Comfortable with pgvector |
| **RAG framework experience** | Experienced with embeddings + retrieval patterns |
| **Fortran familiarity** | Learning — will rely on RAG system to aid understanding |
| **Primary stack** | TypeScript, Bun, React, Next.js, Tailwind |

---

## Phase 2: Architecture Discovery

### 6. Vector Database Selection

**Choice: Supabase (pgvector)**

| Criteria | pgvector on Supabase | Alternatives Considered |
|----------|---------------------|------------------------|
| **Hosting** | Managed (Supabase free tier) | Pinecone (managed, free tier limited), ChromaDB (embedded) |
| **Cost** | $0 | Pinecone free = 1 index; Qdrant cloud = limited |
| **Hybrid search** | Yes — pgvector + Postgres full-text search in same DB | Weaviate has native hybrid; Pinecone does not |
| **Filtering** | Full SQL WHERE clauses on metadata | All options support metadata filtering |
| **Familiarity** | High — SQL, Postgres, Supabase SDK | Would need to learn Pinecone/Weaviate APIs |
| **Scaling** | Supabase handles scaling; free tier = 500MB storage | Sufficient for LAPACK embeddings (~50-100MB) |

**Why pgvector over alternatives:**
- Hybrid search (vector + keyword) in one database — critical for code where exact function names matter
- SQL-native metadata filtering (file path, subroutine name, line numbers)
- Zero additional infrastructure — Supabase provides auth, storage, and vector search
- Free tier covers project needs entirely

### 7. Embedding Strategy

**Choice: OpenAI text-embedding-3-small (1536 dimensions)**

| Factor | Decision | Rationale |
|--------|----------|-----------|
| **Model** | text-embedding-3-small | Best cost/quality ratio. $0.02/1M tokens. |
| **Dimensions** | 1536 | Standard size, well-supported by pgvector. Lower storage than 3072d large model. |
| **Code-specific?** | General-purpose (not Voyage Code 2) | text-embedding-3-small handles code well. Voyage Code 2 adds API complexity for marginal gain on Fortran. |
| **Local vs API** | API-based | Quality advantage over local models. Cost is negligible (<$1 for full LAPACK). |
| **Batch processing** | Batch embed during ingestion | OpenAI batch API for initial ingestion. Single embed for queries. |

**Estimated embedding storage:** ~1,500 subroutines × 1536 dims × 4 bytes = ~9MB vectors + metadata

### 8. Chunking Approach

**Choice: Subroutine-level (syntax-aware)**

| Strategy | Decision |
|----------|----------|
| **Primary** | Subroutine/Function-level — each `SUBROUTINE` or `FUNCTION` block becomes one chunk |
| **Fallback** | Fixed-size (500 tokens, 50 token overlap) for files without clear subroutine boundaries |
| **Overlap** | None for subroutine-level (complete units); 50 tokens for fixed-size |
| **Metadata preserved** | File path, line start/end, subroutine name, parameter list, module name, called subroutines |

**Fortran-specific chunking rules:**
1. Detect `SUBROUTINE name(args)` ... `END SUBROUTINE` blocks
2. Detect `FUNCTION name(args)` ... `END FUNCTION` blocks
3. Preserve leading comments as part of the chunk (they document the subroutine)
4. Extract metadata: name, parameters, local variables, CALL statements (dependencies)
5. For module-level code outside subroutines, chunk at module boundaries
6. Files without subroutines → fixed-size chunking with overlap

**Expected chunks:** ~1,500-2,000 chunks for LAPACK

### 9. Retrieval Pipeline

```
User Query
    ↓
Query Preprocessing (normalize, extract entities like function names)
    ↓
┌─────────────────────────────────┐
│  Parallel Search                │
│  ├─ Vector similarity (pgvector)│  → top-10 candidates
│  └─ Full-text keyword (Postgres)│  → top-10 candidates
└─────────────────────────────────┘
    ↓
Merge + Deduplicate results
    ↓
Re-rank (LLM-based) → top-5 final results
    ↓
Context Assembly (retrieved chunks + surrounding context)
    ↓
Claude API (streaming) → Answer with citations
```

| Config | Value | Rationale |
|--------|-------|-----------|
| **Top-k (retrieval)** | 10 | Cast wide net from both vector and keyword search |
| **Top-k (final)** | 5 | Re-rank to 5 for LLM context window efficiency |
| **Re-ranking** | LLM-based (Claude) | Score relevance of each chunk to query before final assembly |
| **Context window** | ~4K tokens of code context | Leave room for system prompt + answer generation |
| **Query expansion** | No (MVP) | Add multi-query in polish phase if needed |

### 10. Answer Generation

| Config | Decision |
|--------|----------|
| **LLM** | Claude (Anthropic API) |
| **Response mode** | Streaming — stream answer as it generates |
| **Citations** | Include file path + line numbers for every referenced chunk |
| **Prompt template** | System prompt with Fortran/LAPACK context + retrieved chunks + user query |
| **Formatting** | Markdown with syntax-highlighted code blocks |

**Prompt template structure:**
```
System: You are a Fortran/LAPACK code expert. Answer questions using ONLY the provided code context.
Always cite file paths and line numbers. If the context doesn't contain the answer, say so.

Context:
[retrieved chunks with metadata]

User: {query}
```

### 11. Framework Selection

**Choice: Custom pipeline (no framework)**

| Option | Verdict | Reason |
|--------|---------|--------|
| **Custom** | ✅ Selected | Full control, no abstraction overhead, matches existing skills |
| LangChain | ❌ | Unnecessary abstraction for a straightforward pgvector + OpenAI + Claude pipeline |
| LlamaIndex | ❌ | Document-focused, adds complexity without clear benefit here |

**Stack:**

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Language | TypeScript |
| Vector DB | Supabase (pgvector) |
| Embeddings | OpenAI text-embedding-3-small |
| LLM | Claude (Anthropic API) |
| CLI | Custom (publish to npm) |
| Distribution | npm package (publicly accessible CLI) |

---

## Phase 3: Post-Stack Refinement

### 12. Failure Mode Analysis

| Failure Mode | Handling Strategy |
|-------------|-------------------|
| **No relevant results** | Return "No relevant code found for this query." Log failed query. Suggest rephrasing. Fall back to keyword search before giving up. |
| **Ambiguous query** | Return best-effort results with lower confidence scores. Suggest more specific queries. |
| **Rate limiting (OpenAI/Claude)** | Exponential backoff with retry. Cache query embeddings to reduce API calls. |
| **Large subroutine exceeds token limit** | Truncate with note, or split into logical sections preserving structure. |
| **Embedding model mismatch** | Ensure same model (text-embedding-3-small) for both ingestion and query. Store model version in metadata. |

### 13. Evaluation Strategy

**Approach: Manual test suite**

Test queries (from PRD + custom):

| # | Query | Expected Result |
|---|-------|----------------|
| 1 | "Where is the main entry point of this program?" | Top-level driver routines |
| 2 | "What subroutines compute eigenvalues?" | DGEEV, DSYEV, etc. |
| 3 | "Explain what DGESV does" | Solves general linear system AX=B |
| 4 | "Find all file I/O operations" | OPEN/READ/WRITE statements |
| 5 | "What are the dependencies of DGETRF?" | DGETF2, DLASWP, DTRSM, DGEMM |
| 6 | "Show me error handling patterns" | INFO parameter checks, XERBLA calls |

**Metrics:**
- Retrieval precision@5: target >70% relevant chunks
- Correct file/line references: manual verification
- Answer accuracy: does the explanation match the code?

**Ground truth:** 20-30 manually verified query-result pairs.

### 14. Performance Optimization

| Optimization | Phase | Approach |
|-------------|-------|----------|
| **Embedding cache** | MVP | Cache query embeddings (in-memory Map or Supabase table) to avoid recomputing for repeated queries |
| **pgvector index** | MVP | Create IVFFlat or HNSW index on embedding column for fast similarity search |
| **Query preprocessing** | MVP | Normalize whitespace, extract Fortran identifiers for keyword boost |
| **Batch ingestion** | MVP | Batch OpenAI embedding calls (max 2048 inputs per request) |
| **Connection pooling** | Polish | Supabase connection pooler for concurrent queries |

### 15. Observability

| Component | Implementation |
|-----------|---------------|
| **Query logging** | Supabase `query_logs` table: query text, embedding time, retrieval time, total latency, result count, chunks returned |
| **Structured console logs** | JSON logs with timestamp, query, latency breakdown, error info |
| **Metrics tracked** | Query latency (p50/p95), retrieval precision, embedding cache hit rate, error rate |
| **Alerting** | None for MVP — console monitoring sufficient for demo scale |

### 16. Deployment & DevOps

| Concern | Approach |
|---------|----------|
| **CLI distribution** | Publish to npm as `legacylens` — users install globally with `npm i -g legacylens` or `bunx legacylens` |
| **Web deployment** | None — CLI-only. PRD says "CLI or web"; npm publish satisfies "deployed and publicly accessible." |
| **Database** | Supabase project with pgvector extension enabled |
| **Index updates** | CLI command `legacylens ingest <path>` for re-indexing. CI/CD not needed for MVP. |
| **Environment management** | `.env.local` for API keys (Supabase, OpenAI, Anthropic) |
| **Secrets** | `.env` file for local API keys (Supabase, OpenAI, Anthropic). Never committed. Users provide their own keys or use `legacylens init` to configure. |

#### Two Operating Modes

**Mode 1: Hosted (default, MVP)**
- User installs CLI, queries hit *our* Supabase instance (pre-ingested LAPACK) and our API keys
- Zero config — `npx legacylens query "what does DGESV do?"` works immediately
- We absorb API costs (trivial at demo scale)

**Mode 2: Bring Your Own Infra (BYOI, post-MVP)**
- User runs `legacylens init` → interactive setup wizard
- Prompts for: Supabase connection string (or any Postgres+pgvector), OpenAI API key, Anthropic API key
- `legacylens migrate` → runs schema migrations on their DB (creates embeddings table, indexes, query_logs)
- `legacylens ingest <path>` → ingests *any* codebase into their own DB
- Config stored in `~/.legacylens/config.json`

This turns LegacyLens from a LAPACK-specific demo into a general-purpose legacy code RAG tool. BYOI is not MVP scope but the architecture should support it from day one (config layer, no hardcoded connection strings).

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────┐
│                    LegacyLens                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Ingestion Pipeline                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Scan     │→ │ Parse    │→ │ Chunk            │  │
│  │ .f/.f90  │  │ Fortran  │  │ (subroutine-     │  │
│  │ files    │  │ structure│  │  level)           │  │
│  └──────────┘  └──────────┘  └────────┬─────────┘  │
│                                        ↓            │
│                              ┌──────────────────┐   │
│                              │ OpenAI Embed     │   │
│                              │ (3-small, 1536d) │   │
│                              └────────┬─────────┘   │
│                                        ↓            │
│                              ┌──────────────────┐   │
│                              │ Supabase pgvector│   │
│                              │ + metadata       │   │
│                              └──────────────────┘   │
│                                        ↑            │
│  Query Pipeline                        │            │
│  ┌──────────┐  ┌──────────┐  ┌────────┴─────────┐  │
│  │ CLI      │→ │ Embed    │→ │ Hybrid Search    │  │
│  │ (npm)    │  │ Query    │  │ (vector+keyword) │  │
│  └──────────┘  └──────────┘  └────────┬─────────┘  │
│                                        ↓            │
│                              ┌──────────────────┐   │
│                              │ Re-rank (top 10  │   │
│                              │  → top 5)        │   │
│                              └────────┬─────────┘   │
│                                        ↓            │
│                              ┌──────────────────┐   │
│                              │ Claude (stream)  │   │
│                              │ Answer + cite    │   │
│                              └──────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Cost Projections

### Development Costs (Estimated)

| Item | Cost |
|------|------|
| LAPACK embedding (one-time) | ~$0.50 |
| Query embeddings (dev/testing) | ~$0.10 |
| Claude API (answer gen, dev) | ~$5.00 |
| Supabase | $0 (free tier) |
| npm hosting | $0 |
| **Total development** | **~$5-6** |

### Production Projections (Monthly)

| Scale | Queries/day | Embedding Cost | LLM Cost | DB Cost | Total |
|-------|------------|----------------|----------|---------|-------|
| 100 users | ~100 | $0.05 | $3 | $0 | ~$3/mo |
| 1,000 users | ~1,000 | $0.50 | $30 | $0 | ~$30/mo |
| 10,000 users | ~10,000 | $5 | $300 | $25 | ~$330/mo |
| 100,000 users | ~100,000 | $50 | $3,000 | $100 | ~$3,150/mo |

*Assumptions: 1 query/user/day, ~500 tokens/query embedding, ~2K tokens/answer generation, Supabase Pro at 10K+ scale.*

---

## Key Decisions & Tradeoffs

| Decision | Tradeoff | Why |
|----------|----------|-----|
| pgvector over Pinecone | Less managed scaling, but free + hybrid search + SQL familiarity | Budget constraint + hybrid search requirement |
| Custom pipeline over LangChain | More code to write, but no abstraction leaks or framework lock-in | Full control, simpler debugging, matches existing skills |
| Subroutine-level chunking | May miss file-level context, but preserves complete logic units | Fortran subroutines are natural, self-contained boundaries |
| text-embedding-3-small over Voyage Code 2 | Slightly lower code-specific quality, but simpler (one API) and cheaper | Cost efficiency, proven quality, single vendor for embeddings |
| CLI-only (no web app) | Evaluators must install to test, but PRD explicitly allows "CLI or web" | npm publish = "deployed and publicly accessible". Eliminates entire frontend/hosting layer. More time for RAG quality. |
| Claude over GPT-4 for answers | Slightly higher cost, but excellent code understanding | Better at structured analysis, preferred stack |
| Hosted + BYOI dual mode | More architecture upfront (config layer, no hardcoded strings) | Hosted = zero-friction demo. BYOI = real product story. Architecture cost is minimal if planned from day one. |

---

## Unresolved Questions

1. **Fortran parser quality** — How robust does the subroutine parser need to be? LAPACK uses both fixed-form (.f) and free-form (.f90) Fortran. Need to handle both.
2. **Re-ranking cost** — LLM-based re-ranking doubles Claude API calls per query. Worth it for MVP or defer to polish?
3. **npm package scope** — Publish as `legacylens` or `@ryanwaits/legacylens`? Need to check name availability.
4. **LAPACK test files** — Should we index test files or just the source library? Tests add volume but may dilute retrieval quality.
5. **Supabase row limits** — Free tier has limits. Need to verify ~2,000 rows with 1536d vectors fits comfortably.
