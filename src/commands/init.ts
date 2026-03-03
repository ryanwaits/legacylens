import { createInterface } from "node:readline";
import chalk from "chalk";
import ora from "ora";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { saveConfig } from "../config.ts";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function initCommand(): Promise<void> {
  console.log(chalk.bold("\n  🔧 LegacyLens Setup\n"));
  console.log(
    chalk.dim(
      "  LegacyLens uses OpenAI for code embeddings and Anthropic Claude\n  for answer generation. You'll need API keys for both.\n"
    )
  );

  // OpenAI key
  const openaiKey = await prompt("  ? OpenAI API key: ");
  if (!openaiKey) {
    console.error(chalk.red("  ✗ OpenAI key required"));
    process.exit(1);
  }

  const openaiSpinner = ora("  Verifying OpenAI key...").start();
  try {
    const client = new OpenAI({ apiKey: openaiKey });
    await client.embeddings.create({
      model: "text-embedding-3-small",
      input: "test",
    });
    openaiSpinner.succeed("  OpenAI key verified (text-embedding-3-small accessible)");
  } catch {
    openaiSpinner.fail("  OpenAI key invalid or text-embedding-3-small not accessible");
    process.exit(1);
  }

  // Anthropic key
  const anthropicKey = await prompt("  ? Anthropic API key: ");
  if (!anthropicKey) {
    console.error(chalk.red("  ✗ Anthropic key required"));
    process.exit(1);
  }

  const anthropicSpinner = ora("  Verifying Anthropic key...").start();
  try {
    const client = new Anthropic({ apiKey: anthropicKey });
    await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 10,
      messages: [{ role: "user", content: "Hi" }],
    });
    anthropicSpinner.succeed("  Anthropic key verified (Claude Sonnet accessible)");
  } catch {
    anthropicSpinner.fail("  Anthropic key invalid or Claude Sonnet not accessible");
    process.exit(1);
  }

  // Save
  saveConfig({
    openai_api_key: openaiKey,
    anthropic_api_key: anthropicKey,
  });

  console.log(chalk.green("\n  ✔ Config saved to ~/.legacylens/config.json"));
  console.log(
    chalk.green(
      "  ✔ Connected to LegacyLens index (2 codebases: LAPACK, NASA cFS)"
    )
  );
  console.log(chalk.dim("\n  You're ready! Try:"));
  console.log(chalk.dim('    legacylens query "What does DGESV do?"'));
  console.log(chalk.dim("    legacylens explain CFE_ES_Main --codebase cfs\n"));
}
