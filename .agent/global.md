# Bluprint Global Rules

## Read This First (Routing — Required)
- Before any change, you must read the relevant rule file(s):
  - Library/runtime code: `.agent/lib.md`
  - Tests: `.agent/tests.md`
  - Docs/guides: `.agent/docs.md`
  - Project structure/scaffolding: `.agent/project-structure.md`
  - Types/shared contracts: `.agent/types.md`
  - CLI commands/operational runbooks: `.agent/commands.md`

This document defines the essential constraints that all code—automated or manual—must follow when working on the **Bluprint** CLI project.

## Guide to Rules
- Hard Constraints: non-negotiable requirements that must always be followed.
- Soft Constraints: preferred approaches; can be broken with explicit justification.
- Process: steps to apply the rules when adding or changing code.

---

## Hard Constraints

### 1. Documentation: Intent Over Narration

Comments and documentation must explain **intent, constraints, assumptions, and rationale**, not restate what the code already shows.

**The code explains what; documentation explains why.**

**Allowed:**

> "Uses synchronous write to avoid partial writes on non-atomic filesystems."

**Forbidden:**

> "First we read the file, then we parse it…"

No prompt contamination, recency-based commentary, or "thinking out loud" comments anywhere in the codebase.

---

### 2. Exported Function Documentation

All exported functions must have a header comment using the Bluprint template:

```ts
/**
 * One-sentence purpose summary for Bluprint.
 *
 * @param arg - Purpose, constraints, assumptions.
 * @returns Structured return description. Must note Result/ResultAsync.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync. (Include only if the function performs error handling or returns a Result/ResultAsync.)
 */
```

---

### 3. Error Handling: Never Throw

Application code must never throw. Represent failures with `Result<T, AppError>` / `ResultAsync<T, AppError>` using the standard `AppError` shape.

Rules:
- Raw `Error` objects must never propagate.
- All errors must flow through the unified `AppError` system.
- Result/ResultAsync must be specified in return types when used.
- Do not nest error handling or wrap an existing `AppError` in another error. Return the existing `AppError` as-is, or construct a single `AppError` directly. Avoid patterns like `okAsync(null).andThen(() => err(createAppError(...)))`; use `errAsync(createAppError(...))` instead.

---

### 4. Strict TypeScript Requirements

TypeScript must be used in its strongest form.

**Forbidden:**
- `any` (implicit or explicit)
- Implicit return types
- Untyped module interfaces

**Required:**
- Explicit return types for all functions
- `Result`/`ResultAsync` must be specified in return types when used

---

### 5. Node.js Runtime Compatibility

All runtime code must remain fully Node.js compatible. No Bun-specific runtime APIs may appear.

**Forbidden Runtime APIs:**
- `Bun.serve()`
- `bun:sqlite`
- `Bun.redis`
- `Bun.sql`
- `Bun.file`
- `Bun.$` (template shell runner)

**Allowed:**
- Node standard built-ins without the `node:` prefix:
  ```ts
  import fs from 'fs/promises';
  import path from 'path';
  import process from 'process';
  ```

---

## Soft Constraints

### 1. Internal Function Documentation

Internal functions only need header comments when they:
- Contain branching logic
- Perform retries or multiple paths
- Execute non-obvious transformations
- Involve complexity or non-trivial reasoning

Skip comments for trivial helpers.

---

### 2. Inline Comments

Inline comments should only:
- Explain non-obvious conditions
- Clarify motivations behind edge case handling

Inline comments must not:
- Narrate step-by-step execution
- Restate obvious behavior

---

### 3. Export Organization

All exports must be at the bottom of the file. When exporting more than 3 very similar functions (e.g., git wrappers), organize them in a single exported object.

**Example:**
```ts
export const gitUtils = {
  gitFetchPrune,
  ensureInsideGitRepo,
  gitCheckBranchExists,
  gitGetRepoRoot,
  gitGetDiffAgainst,
};
```
