import { Lexer, type Token, type Tokens } from "marked";
import chalk from "chalk";
import { createEmphasize } from "emphasize";
import fortran from "highlight.js/lib/languages/fortran";
import c from "highlight.js/lib/languages/c";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import typescript from "highlight.js/lib/languages/typescript";

const emphasize = createEmphasize();
emphasize.register({ fortran, c, bash, json, typescript });

// ─── Theme ───────────────────────────────────────────────────
const HEADING_COLORS = [
  chalk.bold.hex("#C084FC"), // h1 — purple
  chalk.bold.hex("#60A5FA"), // h2 — blue
  chalk.bold.hex("#34D399"), // h3 — green
  chalk.bold.hex("#FBBF24"), // h4 — amber
  chalk.bold.hex("#FB923C"), // h5 — orange
  chalk.bold.hex("#F87171"), // h6 — red
];

const INDENT = "  ";
const BOX_TOP = chalk.dim("  ┌─");
const BOX_BOTTOM = chalk.dim("  └─");
const BOX_SIDE = chalk.dim("  │ ");
const HR_LINE = chalk.dim("  " + "─".repeat(60));

// ─── Helpers ─────────────────────────────────────────────────
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function pad(s: string, width: number): string {
  const visible = stripAnsi(s).length;
  return s + " ".repeat(Math.max(0, width - visible));
}

// ─── Inline token rendering ─────────────────────────────────
function renderInline(tokens: Token[]): string {
  let out = "";
  for (const t of tokens) {
    switch (t.type) {
      case "strong":
        out += chalk.bold(renderInline((t as Tokens.Strong).tokens));
        break;
      case "em":
        out += chalk.italic(renderInline((t as Tokens.Em).tokens));
        break;
      case "codespan":
        out += chalk.bgHex("#1E1E2E").hex("#F38BA8")(
          ` ${(t as Tokens.Codespan).text} `
        );
        break;
      case "link":
        out += chalk.cyan.underline((t as Tokens.Link).text);
        break;
      case "text": {
        const tt = t as Tokens.Text;
        // Key fix: if text token has nested tokens, recurse into them
        if ("tokens" in tt && Array.isArray(tt.tokens) && tt.tokens.length > 0) {
          out += renderInline(tt.tokens);
        } else {
          out += tt.text;
        }
        break;
      }
      default:
        out += "raw" in t ? (t as { raw: string }).raw : "";
    }
  }
  return out;
}

// ─── List item rendering (handles nested lists) ─────────────
function renderListItem(
  item: Tokens.ListItem,
  bullet: string,
  depth: number
): string {
  const indent = INDENT.repeat(depth);
  const lines: string[] = [];

  for (const sub of item.tokens) {
    if (sub.type === "text") {
      const tt = sub as Tokens.Text;
      if ("tokens" in tt && Array.isArray(tt.tokens) && tt.tokens.length > 0) {
        lines.push(indent + bullet + renderInline(tt.tokens));
      } else {
        lines.push(indent + bullet + tt.text);
      }
    } else if (sub.type === "list") {
      // Nested list
      lines.push(renderList(sub as Tokens.List, depth + 1));
    } else if (sub.type === "paragraph") {
      lines.push(
        indent + bullet + renderInline((sub as Tokens.Paragraph).tokens)
      );
    }
  }

  return lines.join("\n");
}

function renderList(token: Tokens.List, depth: number = 0): string {
  return token.items
    .map((item, i) => {
      const bullet = token.ordered
        ? chalk.dim(`${i + 1}. `)
        : chalk.dim("• ");
      return renderListItem(item, bullet, depth);
    })
    .join("\n");
}

// ─── Code block rendering ────────────────────────────────────
function renderCodeBlock(code: string, lang?: string): string {
  const lines: string[] = [];
  const langLabel = lang ? chalk.dim.italic(` ${lang} `) : "";

  lines.push(BOX_TOP + chalk.dim("─".repeat(56)) + langLabel);

  let highlighted: string;
  try {
    if (lang && emphasize.registered(lang)) {
      highlighted = emphasize.highlight(lang, code).value;
    } else {
      highlighted = emphasize.highlightAuto(code).value;
    }
  } catch {
    highlighted = chalk.white(code);
  }

  for (const line of highlighted.split("\n")) {
    lines.push(BOX_SIDE + line);
  }

  lines.push(BOX_BOTTOM + chalk.dim("─".repeat(56)));
  return lines.join("\n");
}

// ─── Table rendering ─────────────────────────────────────────
function renderTable(token: Tokens.Table): string {
  const lines: string[] = [];
  const colWidths: number[] = [];

  for (let i = 0; i < token.header.length; i++) {
    let max = stripAnsi(renderInline(token.header[i]!.tokens)).length;
    for (const row of token.rows) {
      const cell = row[i];
      if (cell) {
        const len = stripAnsi(renderInline(cell.tokens)).length;
        if (len > max) max = len;
      }
    }
    colWidths.push(Math.min(max + 2, 40));
  }

  const headerCells = token.header.map((h, i) =>
    chalk.bold(pad(renderInline(h.tokens), colWidths[i]!))
  );
  lines.push(INDENT + headerCells.join(chalk.dim(" │ ")));
  lines.push(
    INDENT +
      colWidths.map((w) => chalk.dim("─".repeat(w))).join(chalk.dim("─┼─"))
  );

  for (const row of token.rows) {
    const cells = row.map((cell, i) =>
      pad(renderInline(cell.tokens), colWidths[i]!)
    );
    lines.push(INDENT + cells.join(chalk.dim(" │ ")));
  }

  return lines.join("\n");
}

// ─── Block-level rendering ───────────────────────────────────
function renderBlock(token: Token): string {
  switch (token.type) {
    case "heading": {
      const t = token as Tokens.Heading;
      const color = HEADING_COLORS[t.depth - 1] || chalk.bold;
      const prefix =
        t.depth === 1 ? "# " : t.depth === 2 ? "## " : "### ";
      const text = renderInline(t.tokens);
      let out = "\n" + color(prefix + text);
      if (t.depth <= 2) {
        out +=
          "\n" +
          chalk.dim(
            "─".repeat(stripAnsi(text).length + prefix.length + 2)
          );
      }
      return out;
    }

    case "paragraph": {
      const t = token as Tokens.Paragraph;
      return "\n" + INDENT + renderInline(t.tokens);
    }

    case "code": {
      const t = token as Tokens.Code;
      return "\n" + renderCodeBlock(t.text, t.lang || undefined);
    }

    case "blockquote": {
      const t = token as Tokens.Blockquote;
      const inner = t.tokens.map(renderBlock).join("");
      return inner
        .split("\n")
        .map((line) => chalk.dim("  ▎ ") + chalk.italic(line.trim()))
        .join("\n");
    }

    case "list":
      return "\n" + renderList(token as Tokens.List);

    case "table":
      return "\n" + renderTable(token as Tokens.Table);

    case "hr":
      return "\n" + HR_LINE;

    case "space":
      return "";

    default:
      return "raw" in token ? (token as { raw: string }).raw : "";
  }
}

// ─── Main render function ────────────────────────────────────
export function renderMarkdown(markdown: string): string {
  const tokens = new Lexer().lex(markdown);
  return tokens.map(renderBlock).join("\n") + "\n";
}
