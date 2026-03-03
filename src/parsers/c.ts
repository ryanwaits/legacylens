import type { ParsedBlock } from "./types.ts";

const FUNC_SIG_RE =
  /^([\w\s*]+?)\s+(\w+)\s*\(([^)]*)\)\s*\{/;
const STRUCT_RE =
  /typedef\s+struct\s*\w*\s*\{/;
const CFE_CALL_RE = /\b(CFE_\w+|OS_\w+)\s*\(/g;

function extractPrecedingComment(lines: string[], startLine: number): string {
  const comments: string[] = [];
  let i = startLine - 1;
  // Look for block comment ending with */
  while (i >= 0 && lines[i]!.trim() === "") i--;
  if (i >= 0 && lines[i]!.trim().endsWith("*/")) {
    // Find start of block comment
    let j = i;
    while (j >= 0 && !lines[j]!.includes("/*")) j--;
    if (j >= 0) {
      for (let k = j; k <= i; k++) {
        comments.push(
          lines[k]!
            .replace(/\/\*\*?/, "")
            .replace(/\*\//, "")
            .replace(/^\s*\*\s?/, "")
            .trim()
        );
      }
    }
  }
  return comments.filter(Boolean).join("\n");
}

function findMatchingBrace(lines: string[], startLine: number): number {
  let depth = 0;
  for (let i = startLine; i < lines.length; i++) {
    for (const ch of lines[i]!) {
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return lines.length - 1;
}

function extractCalls(source: string): string[] {
  const calls = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(CFE_CALL_RE.source, "g");
  while ((m = re.exec(source)) !== null) {
    calls.add(m[1]!);
  }
  return [...calls];
}

export function parseCFile(content: string, filePath: string): ParsedBlock[] {
  const lines = content.split("\n");
  const blocks: ParsedBlock[] = [];
  const usedLines = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Skip preprocessor, blank, comments
    if (line.trimStart().startsWith("#") || !line.trim()) continue;

    // Try struct
    if (STRUCT_RE.test(line)) {
      const endLine = findMatchingBrace(lines, i);
      // Look for typedef name after closing brace
      const closingLine = lines[endLine]!;
      const nameMatch = closingLine.match(/}\s*(\w+)\s*;/);
      if (nameMatch) {
        const source = lines.slice(i, endLine + 1).join("\n");
        const comments = extractPrecedingComment(lines, i);
        for (let k = i; k <= endLine; k++) usedLines.add(k);
        blocks.push({
          name: nameMatch[1]!,
          type: "struct",
          sourceCode: source,
          lineStart: i + 1,
          lineEnd: endLine + 1,
          metadata: { comments: comments || undefined },
        });
        i = endLine;
        continue;
      }
    }

    // Try function
    const funcMatch = line.match(FUNC_SIG_RE);
    if (funcMatch) {
      const returnType = funcMatch[1]!.trim();
      const name = funcMatch[2]!;
      const params = funcMatch[3]
        ? funcMatch[3]
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean)
        : [];

      // Skip if it looks like a control structure
      if (
        ["if", "for", "while", "switch", "else"].includes(name.toLowerCase())
      )
        continue;

      const endLine = findMatchingBrace(lines, i);
      const source = lines.slice(i, endLine + 1).join("\n");
      const comments = extractPrecedingComment(lines, i);
      const calledFunctions = extractCalls(source);

      for (let k = i; k <= endLine; k++) usedLines.add(k);

      blocks.push({
        name,
        type: "function",
        sourceCode: source,
        lineStart: i + 1,
        lineEnd: endLine + 1,
        metadata: {
          params,
          returnType,
          calledFunctions,
          comments: comments || undefined,
        },
      });
      i = endLine;
      continue;
    }
  }

  // Fallback chunks for remaining code
  const remainingLines: { lineNum: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!usedLines.has(i) && lines[i]!.trim()) {
      remainingLines.push({ lineNum: i, text: lines[i]! });
    }
  }

  if (remainingLines.length > 20) {
    const chunkSize = 50;
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
