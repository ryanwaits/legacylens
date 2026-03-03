import chalk from "chalk";
import ora from "ora";
import { requireKeys } from "../config.ts";
import { keywordSearch } from "../db/client.ts";
import { renderMarkdown } from "../render.ts";

function getGitHubRawUrl(codebaseId: string, filePath: string): string | null {
  const base = "https://raw.githubusercontent.com";
  if (codebaseId === "lapack") {
    return `${base}/Reference-LAPACK/lapack/HEAD/${filePath}`;
  }
  if (codebaseId === "cfs") {
    if (filePath.startsWith("cFE/")) return `${base}/nasa/cFE/HEAD/${filePath}`;
    if (filePath.startsWith("osal/")) return `${base}/nasa/osal/HEAD/${filePath}`;
  }
  return null;
}

export async function viewCommand(
  name: string,
  options: { codebase?: string; full?: boolean }
): Promise<void> {
  const { openaiKey: _ } = requireKeys();
  const codebase = options.codebase === "all" ? undefined : options.codebase;

  const spinner = ora(`Searching for ${name}...`).start();
  const chunks = await keywordSearch(name, 3, codebase);

  if (chunks.length === 0) {
    spinner.fail(`No results found for "${name}"`);
    return;
  }

  spinner.succeed(`Found ${chunks.length} match${chunks.length > 1 ? "es" : ""}`);

  if (options.full) {
    const c = chunks[0]!;
    const url = getGitHubRawUrl(c.codebase_id, c.file_path);

    if (!url) {
      console.warn(chalk.yellow(`\nNo GitHub URL mapping for ${c.codebase_id}/${c.file_path} — showing chunk only`));
      const header = chalk.bold(`\n${c.chunk_name}`) +
        chalk.dim(` — ${c.file_path}:${c.line_start}-${c.line_end}`);
      process.stdout.write(header + "\n");
      const fenced = `\`\`\`${c.language}\n${c.source_code}\n\`\`\``;
      process.stdout.write(renderMarkdown(fenced));
      return;
    }

    const fetchSpinner = ora(`Fetching full file from GitHub...`).start();
    let fullSource: string;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fullSource = await res.text();
    } catch (err) {
      fetchSpinner.fail(`Failed to fetch full file: ${(err as Error).message}`);
      console.warn(chalk.yellow("Falling back to stored chunk source\n"));
      const header = chalk.bold(`${c.chunk_name}`) +
        chalk.dim(` — ${c.file_path}:${c.line_start}-${c.line_end}`);
      process.stdout.write(header + "\n");
      const fenced = `\`\`\`${c.language}\n${c.source_code}\n\`\`\``;
      process.stdout.write(renderMarkdown(fenced));
      return;
    }
    fetchSpinner.succeed("Fetched full file");

    const header = chalk.bold(`\n${c.chunk_name}`) +
      chalk.dim(` — ${c.file_path} (full file, lines ${c.line_start}-${c.line_end} highlighted)`);
    process.stdout.write(header + "\n\n");

    const lines = fullSource.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const gutter = chalk.dim(String(lineNum).padStart(5) + " │ ");
      const inRange = lineNum >= c.line_start && lineNum <= c.line_end;
      const content = inRange ? lines[i] : chalk.dim(lines[i]);
      const marker = inRange ? chalk.green("▎") : " ";
      process.stdout.write(marker + gutter + content + "\n");
    }
    return;
  }

  for (const c of chunks) {
    const header = chalk.bold(`\n${c.chunk_name}`) +
      chalk.dim(` — ${c.file_path}:${c.line_start}-${c.line_end}`);
    process.stdout.write(header + "\n");

    const fenced = `\`\`\`${c.language}\n${c.source_code}\n\`\`\``;
    process.stdout.write(renderMarkdown(fenced));
  }
}
