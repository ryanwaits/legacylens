import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFortranFile } from "../parsers/fortran.ts";
import { parseCFile } from "../parsers/c.ts";
import {
  embedBatch,
  formatEmbeddingText,
} from "./embed.ts";
import { insertChunks, clearCodebase } from "../db/client.ts";
import type { ParsedBlock, CodeChunkInsert } from "../parsers/types.ts";
import ora from "ora";
import { getOpenAIKey } from "../config.ts";

function globFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

interface IngestConfig {
  codebaseId: string;
  repoUrl: string;
  language: string;
  cloneDir: string;
  filePaths: (baseDir: string) => string[];
  parser: (content: string, filePath: string) => ParsedBlock[];
}

const CONFIGS: Record<string, IngestConfig> = {
  lapack: {
    codebaseId: "lapack",
    repoUrl: "https://github.com/Reference-LAPACK/lapack.git",
    language: "fortran",
    cloneDir: "/tmp/legacylens-lapack",
    filePaths: (base) => [
      ...globFiles(join(base, "SRC"), [".f", ".f90"]),
      ...globFiles(join(base, "BLAS", "SRC"), [".f"]),
    ],
    parser: parseFortranFile,
  },
  cfs: {
    codebaseId: "cfs",
    repoUrl: "",
    language: "c",
    cloneDir: "/tmp/legacylens-cfs",
    filePaths: (base) => {
      const cfeDir = join(base, "cFE");
      const osalDir = join(base, "osal");
      const files: string[] = [];

      // cFE modules (skip test modules)
      const skipModules = ["cfe_assert", "cfe_testcase"];
      if (existsSync(join(cfeDir, "modules"))) {
        for (const mod of readdirSync(join(cfeDir, "modules"))) {
          if (skipModules.includes(mod)) continue;
          files.push(
            ...globFiles(join(cfeDir, "modules", mod, "fsw", "src"), [".c", ".h"])
          );
        }
      }

      // OSAL shared + posix
      files.push(...globFiles(join(osalDir, "src", "os", "shared", "src"), [".c"]));
      files.push(...globFiles(join(osalDir, "src", "os", "posix", "src"), [".c"]));

      return files;
    },
    parser: parseCFile,
  },
};

async function cloneRepo(config: IngestConfig): Promise<void> {
  if (config.codebaseId === "cfs") {
    // cFS has multiple repos
    if (!existsSync(join(config.cloneDir, "cFE"))) {
      execSync(
        `git clone --depth 1 https://github.com/nasa/cFE.git ${join(config.cloneDir, "cFE")}`,
        { stdio: "pipe" }
      );
    }
    if (!existsSync(join(config.cloneDir, "osal"))) {
      execSync(
        `git clone --depth 1 https://github.com/nasa/osal.git ${join(config.cloneDir, "osal")}`,
        { stdio: "pipe" }
      );
    }
  } else {
    if (!existsSync(config.cloneDir)) {
      execSync(
        `git clone --depth 1 ${config.repoUrl} ${config.cloneDir}`,
        { stdio: "pipe" }
      );
    }
  }
}

export async function ingestCodebase(
  codebaseId: "lapack" | "cfs"
): Promise<void> {
  const config = CONFIGS[codebaseId];
  if (!config) throw new Error(`Unknown codebase: ${codebaseId}`);

  const openaiKey = getOpenAIKey();
  if (!openaiKey) {
    console.error("OPENAI_API_KEY required for ingestion");
    process.exit(1);
  }

  const spinner = ora(`Cloning ${codebaseId}...`).start();

  // Clone
  await cloneRepo(config);
  spinner.text = `Parsing ${codebaseId} files...`;

  // Parse
  const files = config.filePaths(config.cloneDir);
  spinner.text = `Found ${files.length} files in ${codebaseId}`;

  const allBlocks: { block: ParsedBlock; filePath: string }[] = [];
  for (const file of files) {
    try {
      const content = readFileSync(file, "utf-8");
      const relPath = file.replace(config.cloneDir + "/", "");
      const blocks = config.parser(content, relPath);
      for (const block of blocks) {
        allBlocks.push({ block, filePath: relPath });
      }
    } catch {
      // Skip unparseable files
    }
  }

  spinner.text = `Parsed ${allBlocks.length} blocks from ${files.length} files`;

  // Clear existing data
  spinner.text = `Clearing existing ${codebaseId} data...`;
  await clearCodebase(codebaseId);

  // Embed in batches
  spinner.text = `Embedding ${allBlocks.length} blocks...`;
  const texts = allBlocks.map(({ block }) =>
    formatEmbeddingText(
      block.type,
      block.name,
      block.metadata.comments,
      block.sourceCode
    )
  );

  const embeddings = await embedBatch(texts, openaiKey);

  // Build insert records
  const chunks: CodeChunkInsert[] = allBlocks.map(({ block, filePath }, i) => ({
    codebase_id: codebaseId,
    file_path: filePath,
    chunk_name: block.name,
    chunk_type: block.type,
    source_code: block.sourceCode,
    embedding: embeddings[i]!,
    metadata: block.metadata as Record<string, unknown>,
    line_start: block.lineStart,
    line_end: block.lineEnd,
    language: config.language,
  }));

  // Insert in batches
  spinner.text = `Storing ${chunks.length} chunks in database...`;
  await insertChunks(chunks);

  spinner.succeed(
    `Ingested ${codebaseId}: ${chunks.length} chunks from ${files.length} files`
  );
}

// CLI entrypoint
if (import.meta.main) {
  const codebase = process.argv[2] as "lapack" | "cfs" | undefined;
  if (!codebase || !["lapack", "cfs"].includes(codebase)) {
    console.error("Usage: bun run src/ingestion/ingest.ts <lapack|cfs>");
    process.exit(1);
  }
  await ingestCodebase(codebase);
}
