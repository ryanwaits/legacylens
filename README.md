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

### `examples` — Quick reference

Prints example queries for every command.

```bash
legacylens examples
```

## Options

All query commands accept:

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--codebase` | `lapack`, `cfs`, `all` | `all` | Filter to a specific codebase |

## How it works

1. **Hybrid retrieval** — parallel vector similarity + keyword search against Supabase
2. **LLM reranking** — Claude scores and selects the most relevant code chunks
3. **Structured generation** — Claude generates formatted responses with source citations
4. **Rich rendering** — syntax-highlighted code, styled tables, colored headers in your terminal

## Development

```bash
bun install
bun run src/cli.ts query "What does DGESV do?" --codebase lapack
bun run build
```

## License

MIT
