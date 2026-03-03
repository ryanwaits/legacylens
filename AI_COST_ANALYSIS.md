# AI Cost Analysis — LegacyLens

## Development & Testing Costs

Actual spend during development:

| Category | Details | Cost |
|----------|---------|------|
| **Embedding (ingestion)** | LAPACK (~25M tokens) + cFS (~5M tokens) via text-embedding-3-small @ $0.02/1M | $0.60 |
| **Embedding (dev queries)** | ~200 test queries × ~100 tokens avg @ $0.02/1M | $0.01 |
| **LLM — answer generation** | ~100 Claude Sonnet responses × ~2K output tokens @ $15/1M output | $3.00 |
| **LLM — re-ranking** | ~100 re-rank calls × ~500 output tokens @ $15/1M output | $0.75 |
| **Vector DB (Supabase)** | Free tier — 500MB storage, ~50MB used | $0.00 |
| **npm hosting** | Free | $0.00 |
| **Total development spend** | | **~$4.36** |

### Token Breakdown

| Operation | Tokens | Model | Rate |
|-----------|--------|-------|------|
| LAPACK ingestion | ~25M input | text-embedding-3-small | $0.02/1M |
| cFS ingestion | ~5M input | text-embedding-3-small | $0.02/1M |
| Query embeddings | ~20K input | text-embedding-3-small | $0.02/1M |
| Re-rank (input) | ~500K input | Claude Sonnet | $3/1M |
| Re-rank (output) | ~50K output | Claude Sonnet | $15/1M |
| Answer gen (input) | ~400K input | Claude Sonnet | $3/1M |
| Answer gen (output) | ~200K output | Claude Sonnet | $15/1M |

## Production Cost Projections

### Assumptions

- **Queries per user per day**: 1
- **Per query costs**:
  - Embedding: ~100 tokens × $0.02/1M = $0.000002
  - Re-ranking: ~5K input + ~500 output tokens = $0.0225
  - Answer generation: ~4K input + ~2K output tokens = $0.042
  - **Total per query: ~$0.065**
- **Vector DB**: Supabase free tier up to 500MB. Pro tier ($25/mo) at 10K+ users for connection pooling.
- **New codebase ingestion**: ~$0.60 per 250K LOC codebase (one-time)

### Monthly Projections

| Scale | Queries/day | Embedding | LLM (re-rank + gen) | Vector DB | Total/month |
|-------|-------------|-----------|---------------------|-----------|-------------|
| **100 users** | 100 | $0.06 | $194 | $0 (free) | **~$195/mo** |
| **1,000 users** | 1,000 | $0.60 | $1,940 | $0 (free) | **~$1,940/mo** |
| **10,000 users** | 10,000 | $6.00 | $19,400 | $25 (Pro) | **~$19,430/mo** |
| **100,000 users** | 100,000 | $60.00 | $194,000 | $100 (Team) | **~$194,160/mo** |

### Cost Optimization Strategies

At scale, several strategies could dramatically reduce costs:

| Strategy | Impact | Complexity |
|----------|--------|------------|
| **Query embedding cache** | Eliminate redundant embeddings for repeated queries | Low — in-memory Map or Redis |
| **Response cache** | Skip LLM entirely for identical queries | Low — hash query + codebase filter |
| **Smaller re-rank model** | Use Haiku instead of Sonnet for re-ranking | Low — swap model ID |
| **Skip re-ranking for high-confidence** | If top vector result has similarity >0.95, skip re-rank | Medium — threshold tuning |
| **Batch query processing** | Aggregate queries, reduce API call overhead | Medium |
| **Fine-tuned small model** | Replace Claude with fine-tuned model for answer gen | High — training pipeline needed |

### Cost Sensitivity

LLM answer generation dominates costs (>95%). The most impactful optimization is response caching — legacy codebases change infrequently, so many queries will have identical answers. A cache hit rate of 50% would halve costs at every scale.

Embedding costs are negligible at all scales.

Vector DB costs are negligible until very high concurrency requires connection pooling (Supabase Pro at $25/mo).
