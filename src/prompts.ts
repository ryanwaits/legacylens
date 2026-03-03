const LAPACK_CONTEXT = `LAPACK (Linear Algebra PACKage) is a Fortran library for numerical linear algebra.
Naming convention: first letter = precision (D=double, S=single, C=complex single, Z=complex double).
Second two letters = matrix type (GE=general, SY=symmetric, HE=Hermitian, TR=triangular, etc.).
Remaining letters = algorithm (SV=solve, EV=eigenvalue, SVD=singular value decomposition, etc.).
BLAS routines are low-level building blocks (DGEMM=matrix multiply, DTRSM=triangular solve, etc.).
XERBLA is the standard error handler. INFO parameter: 0=success, <0=bad arg, >0=algorithmic failure.`;

const CFS_CONTEXT = `NASA cFS (core Flight System) is a modular flight software framework used on spacecraft.
cFE (core Flight Executive) modules: ES=Executive Services, SB=Software Bus, EVS=Event Services,
TBL=Table Services, TIME=Time Services, FS=File Services, MSG=Message.
OSAL (OS Abstraction Layer) provides OS-independent APIs: OS_TaskCreate, OS_QueueCreate, etc.
PSP (Platform Support Package) provides hardware abstraction.
Patterns: publish-subscribe messaging via SB, event-driven error handling via EVS,
CFE_Status_t return codes with CFE_SUCCESS for success.`;

const COMMAND_PROMPTS: Record<string, string> = {
  query: `You are a code expert. Answer the user's question about the codebase using the provided code chunks.
Be specific and cite file paths with line numbers (file:line_start-line_end).
If the chunks don't contain enough info, say so clearly.`,

  explain: `You are a code expert. Provide a deep explanation of the specified function/subroutine.
Include:
- What it does (one-sentence summary + detailed description)
- Algorithm/approach used
- Parameters table (name, type, description)
- Return values or output parameters
- Key dependencies (called functions with file paths)
Format with markdown headers. Cite the source file:line_start-line_end at the end.`,

  deps: `You are a code expert. Map the dependency tree of the specified function.
Show:
- ASCII tree of all direct dependencies with file paths
- Brief description of each dependency's role
- "Called by" section listing callers if available
- Summary: N direct dependencies, M transitive
Use tree-style formatting with └── and ├── characters.`,

  patterns: `You are a code pattern analyst. Identify distinct architectural and design patterns
matching the user's description across the provided code chunks.
For each pattern:
- Name the pattern and which codebase it comes from
- Explain the convention/approach
- Give 2-3 specific examples with file:line references
Number the patterns and provide clear section headers.`,

  docs: `You are a technical documentation generator. Generate comprehensive markdown documentation for the specified function.
Include:
- One-line summary (blockquote)
- Full function signature in a code block
- Parameters table (name, type, direction, description)
- Return values with all possible codes
- Example usage code block
- Related functions section
Format as clean markdown. Cite source file at the end.`,
};

export function getSystemPrompt(
  command: string,
  codebase?: string
): string {
  const base = COMMAND_PROMPTS[command] || COMMAND_PROMPTS["query"]!;

  let context = "";
  if (!codebase || codebase === "all") {
    context = `\n\nCodebase context:\n${LAPACK_CONTEXT}\n\n${CFS_CONTEXT}`;
  } else if (codebase === "lapack") {
    context = `\n\nCodebase context:\n${LAPACK_CONTEXT}`;
  } else if (codebase === "cfs") {
    context = `\n\nCodebase context:\n${CFS_CONTEXT}`;
  }

  return base + context;
}
