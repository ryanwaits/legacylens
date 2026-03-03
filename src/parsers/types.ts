export interface ParsedBlock {
  name: string;
  type: "function" | "subroutine" | "struct" | "chunk";
  sourceCode: string;
  lineStart: number;
  lineEnd: number;
  metadata: {
    params?: string[];
    returnType?: string;
    calledFunctions?: string[];
    comments?: string;
  };
}

export interface CodeChunkInsert {
  codebase_id: string;
  file_path: string;
  chunk_name: string;
  chunk_type: string;
  source_code: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  line_start: number;
  line_end: number;
  language: string;
}

export interface RetrievedChunk {
  id: string;
  codebase_id: string;
  file_path: string;
  chunk_name: string;
  chunk_type: string;
  source_code: string;
  metadata: Record<string, unknown>;
  line_start: number;
  line_end: number;
  language: string;
  similarity?: number;
  rank?: number;
  score?: number;
}
