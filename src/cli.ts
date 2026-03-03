#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.ts";
import { queryCommand } from "./commands/query.ts";
import { explainCommand } from "./commands/explain.ts";
import { depsCommand } from "./commands/deps.ts";
import { patternsCommand } from "./commands/patterns.ts";
import { docsCommand } from "./commands/docs.ts";
import { examplesCommand } from "./commands/examples.ts";

const program = new Command();

program
  .name("legacylens")
  .description(
    "RAG-powered CLI for understanding legacy codebases (LAPACK + NASA cFS)"
  )
  .version("1.0.0");

program
  .command("init")
  .description("Setup wizard — configure API keys")
  .action(initCommand);

program
  .command("query <question>")
  .description("Ask any question about the indexed codebases")
  .option("--codebase <name>", "Filter: lapack | cfs | all", "all")
  .action(queryCommand);

program
  .command("explain <function>")
  .description("Deep explanation of a specific function/subroutine")
  .option("--codebase <name>", "Filter: lapack | cfs | all", "all")
  .action(explainCommand);

program
  .command("deps <function>")
  .description("Map dependencies and call graph")
  .option("--codebase <name>", "Filter: lapack | cfs | all", "all")
  .action(depsCommand);

program
  .command("patterns <description>")
  .description("Find architectural patterns across codebases")
  .option("--codebase <name>", "Filter: lapack | cfs | all", "all")
  .action(patternsCommand);

program
  .command("docs <function>")
  .description("Generate markdown documentation")
  .option("--codebase <name>", "Filter: lapack | cfs | all", "all")
  .action(docsCommand);

program
  .command("examples")
  .description("Show example queries for each command")
  .action(examplesCommand);

program.parse();
