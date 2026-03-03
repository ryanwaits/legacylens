import chalk from "chalk";

const EXAMPLES = `
${chalk.bold("Query")} — ask anything about indexed codebases
  ${chalk.dim("$")} legacylens query "What does DGESV do?"
  ${chalk.dim("$")} legacylens query "How does cFS handle app startup?" --codebase cfs
  ${chalk.dim("$")} legacylens query "What BLAS routines does DGESV depend on?" --codebase lapack

${chalk.bold("Explain")} — deep dive into a specific function
  ${chalk.dim("$")} legacylens explain DGETRF --codebase lapack
  ${chalk.dim("$")} legacylens explain CFE_ES_Main --codebase cfs

${chalk.bold("Deps")} — map dependencies and call graphs
  ${chalk.dim("$")} legacylens deps DGESV --codebase lapack
  ${chalk.dim("$")} legacylens deps CFE_SB_SendMsgFull --codebase cfs

${chalk.bold("Patterns")} — find architectural patterns
  ${chalk.dim("$")} legacylens patterns "error handling" --codebase lapack
  ${chalk.dim("$")} legacylens patterns "message passing" --codebase cfs

${chalk.bold("Docs")} — generate markdown documentation
  ${chalk.dim("$")} legacylens docs DGESV --codebase lapack
  ${chalk.dim("$")} legacylens docs CFE_ES_Main --codebase cfs

${chalk.bold("View")} — view full source code of a function
  ${chalk.dim("$")} legacylens view DGESV --codebase lapack
  ${chalk.dim("$")} legacylens view CFE_ES_Main --codebase cfs
  ${chalk.dim("$")} legacylens view DGESV --codebase lapack --full ${chalk.dim("# fetch full file from GitHub")}
`.trimStart();

export function examplesCommand(): void {
  console.log(EXAMPLES);
}
