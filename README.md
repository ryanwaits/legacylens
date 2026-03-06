# LegacyLens

RAG-powered CLI for understanding legacy codebases. Ask questions, explore dependencies, and generate docs — backed by Claude + vector search.

**Indexed codebases:** LAPACK (Fortran linear algebra) and NASA cFS (spacecraft flight software).

## Install

```bash
npm install -g @waits/legacylens
```

## Setup

```bash
legacylens init
```

Prompts for your OpenAI (embeddings) and Anthropic (generation) API keys. Validates both, saves to `~/.legacylens/config.json`.

Or set env vars directly:

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```

## Commands

### `query` — Ask anything

Free-form questions about the indexed codebases. Uses hybrid vector + keyword search with LLM reranking.

```bash
legacylens query "What does DGESV do?"
legacylens query "How does cFS handle app startup?" --codebase cfs
legacylens query "What BLAS routines does DGESV depend on?" --codebase lapack
```

### `explain` — Deep function explainer

Detailed breakdown of a specific function: summary, algorithm, parameters, dependencies, source location.

```bash
legacylens explain DGETRF --codebase lapack
legacylens explain CFE_ES_Main --codebase cfs
```

### `deps` — Dependency & call graph

Maps the dependency tree of a function with ASCII visualization, file paths, and role descriptions.

```bash
legacylens deps DGESV --codebase lapack
legacylens deps CFE_SB_SendMsgFull --codebase cfs
```

### `patterns` — Architectural patterns

Finds recurring design patterns across codebases with concrete examples and file references.

```bash
legacylens patterns "error handling" --codebase lapack
legacylens patterns "message passing" --codebase cfs
```

### `docs` — Generate documentation

Produces structured markdown docs: signature, parameter table, return values, usage example, related functions.

```bash
legacylens docs DGESV --codebase lapack
legacylens docs CFE_ES_Main --codebase cfs
```

### `view` — View full source code

Look up a function by name and display its full source with syntax highlighting. Useful for drilling down after a query or explain.

```bash
legacylens view DGESV --codebase lapack
legacylens view CFE_ES_Main --codebase cfs
```

Add `--full` to fetch the entire file from GitHub and highlight the chunk's line range in context:

```bash
legacylens view DGESV --codebase lapack --full
```

> **Note:** `--full` fetches from the `HEAD` branch, so line numbers may drift slightly from the ingested snapshot.

### `examples` — Quick reference

Prints example queries for every command.

```bash
legacylens examples
```

## Options

All commands accept these global flags:

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--codebase` | `lapack`, `cfs`, `all` | `all` | Filter to a specific codebase |
| `--full` | — | off | Fetch full file from GitHub (`view` only) |
| `--fast` | — | off | Use a faster model (Haiku) for generation and reranking. Reduces latency significantly |
| `--no-rerank` | — | off | Skip the LLM reranking step for faster retrieval |
| `--verbose` | — | off | Show timing, model, and retrieval stats after the response |

### Performance flags

Combine `--fast` and `--no-rerank` for maximum speed at the cost of some accuracy:

```bash
legacylens --fast query "what is DGEMM"
legacylens --no-rerank explain DGEMM
legacylens --verbose --fast query "what is DGEMM"
legacylens --fast --no-rerank query "what is DGEMM"
```

`--verbose` prints a stats block after the response: retrieval time, time to first token, generation time, total time, token counts, and active flags.

## How it works

1. **Hybrid retrieval** — parallel vector similarity + keyword search against Supabase
2. **LLM reranking** — Claude scores and selects the most relevant code chunks
3. **Streaming generation** — responses stream token-by-token in TTY mode instead of buffering behind a spinner
4. **Rich rendering** — syntax-highlighted code, styled tables, colored headers in your terminal
5. **Relevance scores** — each source citation shows its relevance rating (0-10)

## Documentation

- [Pre-Search Analysis](./PRESEARCH.md) — architecture decisions made before coding
- [RAG Architecture](./RAG_ARCHITECTURE.md) — vector DB, chunking, retrieval pipeline, failure modes
- [AI Cost Analysis](./AI_COST_ANALYSIS.md) — development spend + production projections

## Development

```bash
bun install
bun run src/cli.ts query "What does DGESV do?" --codebase lapack
bun run build
```

## License

MIT
