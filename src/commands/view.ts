import chalk from "chalk";
import ora from "ora";
import { requireKeys } from "../config.ts";
import { keywordSearch } from "../db/client.ts";
import { renderMarkdown } from "../render.ts";

export async function viewCommand(
  name: string,
  options: { codebase?: string }
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

  for (const c of chunks) {
    const header = chalk.bold(`\n${c.chunk_name}`) +
      chalk.dim(` — ${c.file_path}:${c.line_start}-${c.line_end}`);
    process.stdout.write(header + "\n");

    const fenced = `\`\`\`fortran\n${c.source_code}\n\`\`\``;
    process.stdout.write(renderMarkdown(fenced));
  }
}
