import type { ParsedBlock } from "./types.ts";

const SUBROUTINE_RE =
  /^[ \t]*(SUBROUTINE|(?:[\w*]+\s+)?FUNCTION)\s+(\w+)\s*\(([^)]*)\)/gim;
const END_RE = /^[ \t]*END\s+(SUBROUTINE|FUNCTION)\b/gim;
const CALL_RE = /\bCALL\s+(\w+)/gi;

function extractLeadingComments(lines: string[], startLine: number): string {
  const comments: string[] = [];
  let i = startLine - 1;
  while (i >= 0) {
    const line = lines[i]!;
    const trimmed = line.trimStart();
    // Fixed-form: C or * in col 1. Free-form: ! at start
    if (/^[Cc*!]/.test(line) || trimmed.startsWith("!")) {
      comments.unshift(trimmed.replace(/^[Cc*!]\s*/, ""));
      i--;
    } else {
      break;
    }
  }
  return comments.join("\n");
}

function extractCalls(source: string): string[] {
  const calls = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(CALL_RE.source, "gi");
  while ((m = re.exec(source)) !== null) {
    calls.add(m[1]!.toUpperCase());
  }
  return [...calls];
}

export function parseFortranFile(
  content: string,
  filePath: string
): ParsedBlock[] {
  const lines = content.split("\n");
  const blocks: ParsedBlock[] = [];
  const usedLines = new Set<number>();

  // Find SUBROUTINE/FUNCTION blocks
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const subMatch = line.match(
      /^[ \t]*(SUBROUTINE|(?:[\w*]+\s+)?FUNCTION)\s+(\w+)\s*\(([^)]*)\)/i
    );
    if (!subMatch) continue;

    const kind = subMatch[1]!.toUpperCase().includes("FUNCTION")
      ? "function"
      : ("subroutine" as const);
    const name = subMatch[2]!;
    const params = subMatch[3]
      ? subMatch[3]
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : [];

    // Find END
    let endLine = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^[ \t]*END\s+(SUBROUTINE|FUNCTION)\b/i.test(lines[j]!)) {
        endLine = j;
        break;
      }
      if (j === lines.length - 1) endLine = j;
    }

    const sourceCode = lines.slice(i, endLine + 1).join("\n");
    const comments = extractLeadingComments(lines, i);
    const calledFunctions = extractCalls(sourceCode);

    for (let k = i; k <= endLine; k++) usedLines.add(k);

    blocks.push({
      name: name.toUpperCase(),
      type: kind,
      sourceCode,
      lineStart: i + 1,
      lineEnd: endLine + 1,
      metadata: {
        params,
        calledFunctions,
        comments: comments || undefined,
        returnType: kind === "function" ? "varies" : undefined,
      },
    });
  }

  // Fallback: chunk remaining lines into ~500-token blocks
  const remainingLines: { lineNum: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!usedLines.has(i) && lines[i]!.trim()) {
      remainingLines.push({ lineNum: i, text: lines[i]! });
    }
  }

  if (remainingLines.length > 20) {
    const chunkSize = 50; // ~500 tokens
    for (let i = 0; i < remainingLines.length; i += chunkSize) {
      const chunk = remainingLines.slice(i, i + chunkSize);
      const first = chunk[0]!;
      const last = chunk[chunk.length - 1]!;
      blocks.push({
        name: `${filePath.split("/").pop()}_chunk_${Math.floor(i / chunkSize)}`,
        type: "chunk",
        sourceCode: chunk.map((c) => c.text).join("\n"),
        lineStart: first.lineNum + 1,
        lineEnd: last.lineNum + 1,
        metadata: {},
      });
    }
  }

  return blocks;
}
