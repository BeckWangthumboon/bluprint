# Bluprint Agent Development Rules

This document defines opinionated rules for coding agents working on the **Bluprint** CLI project.

This document is written for both humans and coding agents. Its job is to ensure that every contribution—automated or manual—follows a consistent, high-quality, maintainable standard.

---

## 1. Professionalism & Documentation Tone

### 1.1 Intent Over Implementation

Comments must **explain intent, constraints, assumptions, and rationale**, not restate what the code already shows.

**The code explains what; documentation explains why.**

**Allowed:**

> "Uses synchronous write to avoid partial writes on non-atomic filesystems."

**Forbidden:**

> "First we read the file, then we parse it…"

### 1.2 No Prompt Contamination / No Recency-Based Commentary

Code and comments must describe the **stable, long-term purpose** of the function —  
_not_ recent fixes, _not_ instructions from the chat, and _not_ context from the latest modification.

Short-term patches, debugging notes, or incremental improvements MUST NOT appear in header comments **unless they fundamentally change the function’s intended behavior.**

#### Allowed (function behavior meaningfully changed)

- `Adds support for dry-run mode.`

#### Forbidden (recency/spec bleed artifacts)

- `Now with division-by-zero handling.`
- `Updated logic to avoid crash.`
- `Added check from earlier conversation.`

Comments and variable names must express **final, intentional behavior**, not temporary changes or developer reasoning.

---

## 2. Commenting Rules

### 2.1 Header Comments for Exported Functions

Every **exported function** must have a header comment **unless** the function is trivially obvious (e.g., `sum(a, b)`).

**Header Format:**

```ts
/**
 * One-sentence purpose summary for Bluprint.
 *
 * @param arg - Purpose, constraints, assumptions.
 * @returns Structured return description. Must note Result/ResultAsync.
 * @throws Never throws. Errors are represented using AppError.
 */
```

**Content Rules:**

- First line: short, high-level purpose.
- Clarify assumptions (cwd must be project root, config must exist, etc.).
- Must note that the function never throws.
- Must specify what the Result represents.

---

### 2.2 Comments for Internal (Non-Exported) Functions

Internal functions only need header comments if:

- There is branching logic, retries, or multiple paths.
- It performs a transformation that is not self-evident.
- Complexity or non-trivial reasoning is involved.

Do **not** comment trivial helpers.

---

### 2.3 Inline Comments

Inline comments should:

- Explain non-obvious conditions.
- Clarify motivations behind edge case handling.

Inline comments must **not**:

- Narrate step-by-step execution.
- Restate obvious behavior.

---

## 3. Error Handling: "Never Throw"

Bluprint uses **stable, structured, predictable** errors.

### 3.1 High-Level Policy

- Application code **must never throw**.
- Errors must be represented as `Result<T, AppError>` or `ResultAsync<T, AppError>`.
- Raw `Error` objects must never propagate.

---

### 3.2 Unified `AppError` Type

All errors must use a central error structure.

**Required Shape:**

```ts
export type AppErrorCode =
  | 'FS_ERROR'
  | 'FS_NOT_FOUND'
  | 'CONFIG_NOT_FOUND'
  | 'CONFIG_PARSE_ERROR'
  | 'GIT_ERROR'
  | 'LLM_ERROR'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export interface AppError {
  code: AppErrorCode;
  message: string;
  details?: unknown;
}
```

Rules:

- Every error must include a stable `code`.
- `message` must be human-readable and actionable.
- `details` may hold raw context (stderr, stack traces, FS metadata).

---

### 3.3 Safe Wrapper Usage

Any function that performs:

- Filesystem I/O
- Git operations
- LLM queries
- Parsing of untrusted input

**must** be wrapped in a safe helper returning `ResultAsync`.

No command or lib file may call `fs` or shell git directly.

---

### 3.4 Composition Over try/catch

Use `.andThen`, `.map`, `.mapErr`, and `ResultAsync` chaining.

Only use `try/catch` inside low-level helpers (e.g., parsing JSON) that immediately convert exceptions into `AppError`.

---

### 3.5 CLI Boundary Behavior

Inside Yargs handlers:

- Never throw.
- Unwrap Result and write human-friendly errors.
- Prefer `process.exitCode = 1` over `process.exit(1)`.

Handlers should remain thin:

1. Collect args
2. Call lib function
3. Print result
4. Exit with code

---

## 4. Filesystem + Git Safety via Wrapper Functions

All FS and Git operations must use pre-approved safe wrappers.

Rules:

- No direct FS calls in commands or logic.
- No path traversal outside project root.
- All wrappers must normalize paths.
- All wrappers must return `ResultAsync`.
- If the needed behavior lacks a wrapper, create one instead of bypassing the safety layer.
- No raw `git` invocations in commands or logic—use the Git wrapper.

If a new FS behavior is needed:

- Implement the safe wrapper in `lib/`.
- Use it elsewhere; do not bypass it.

### 4.1 Adding a New FS Wrapper

- Define the exact operation and its error codes before coding.
- Normalize and validate paths up front to keep operations inside the project root.
- Wrap imperative calls in `ResultAsync`, converting exceptions into `AppError` with actionable messages.
- Add targeted tests covering success, not-found, and permission/error scenarios.
- Document expected inputs/outputs in the header comment and note any preconditions.
- Ask the user/maintainer to review the new wrapper shape before broad use.

### 4.2 Git Wrapper Expectations

- Keep all Git calls in `lib/git` (or equivalent) and expose them as `ResultAsync<*, AppError>`.
- Normalize repo root detection and reject operations outside the repo.
- Map errors to stable codes with actionable messages.
- Avoid destructive commands (`reset --hard`, `clean -fd`, force actions) unless explicitly confirmed by the user/maintainer.
- Add tests for clean vs. dirty trees when behavior differs.

---

## 5. Directory Structure & Layering

Bluprint enforces strict layering:

```
src/
├── index.ts            # CLI entrypoint + yargs setup
├── types/              # Shared type definitions
│   └── index.ts
├── commands/           # CLI command implementations
│   ├── init.ts
│   └── evaluate.ts
└── lib/                # Domain logic
    ├── config.ts       # Config load/save
    ├── git.ts          # Git wrappers + diff logic
    ├── evaluate.ts     # Evaluation pipeline
    ├── checks.ts       # Static checks
    ├── llm.ts          # LLM ops
    └── output.ts       # Formatting & presentation
```

**Import Rules:**

- `index.ts` → may import from commands, lib, types
- `commands/*` → may import from lib, types
- `lib/*` → may import from types
- `types/*` → may import from nothing else

This ensures:

- Clear boundaries
- No circular dependencies
- Predictable layering for agents

---

## 6. CLI Behavior Rules (Yargs)

### 6.1 Command Definition

- Commands must be registered in `index.ts`.
- Each command lives in its own file under `commands/`.
- Handlers must not contain domain logic.

---

### 6.2 Arg Handling

- Validate args at Yargs level (`demandOption`).
- Provide clear descriptions.
- Defaults must be documented.

---

### 6.3 Output Modes

- Human-readable mode: default.
- `--json` mode must return structured, predictable shapes.
- All formatting must be done in `lib/output.ts`.

---

## 7. Strict Typing Requirements

TypeScript must be used in its strongest form.

Rules:

- No `any`.
- No implicit `any`.
- All return types must be explicit.
- All module interfaces must be typed.
- All functions must specify the `Result` or `ResultAsync` return.

---

## 8. Clean Command Handlers

Command handlers must:

- Contain zero domain logic.
- Only collect flags, call lib functions, and format output.
- Never perform FS, parsing, or git operations directly.
- Remain under ~30 lines whenever possible.

---

## 9. No “Thinking Out Loud” Comments

Agents must never emit:

- "I'm not sure if this is correct…"
- "We might want to revisit this later…"
- "Trying approach X…"
- "TODO: fix this??"

Comments must express **final decisions**, not process.

Allowed:

> "This branch handles cases where the config file is missing, which is expected during first-time initialization."

Forbidden:

> "This might break, not tested yet."

---

## 10. Bun vs Node Runtime Rules

Bluprint uses **Bun for development tooling**, but all **runtime code must remain fully Node.js compatible**.  
Agents must avoid using Bun-specific runtime APIs anywhere in code that ships with the CLI.

### 10.1 Commands (Development Only)

These commands are allowed **during development**, but must not appear inside the CLI runtime logic:

- Use `bun <file>` only to run local development scripts.
- Use `bun test` for running the test suite (tests may rely on Bun).
- Use `bun build <file>` for development bundling if needed.
- Use `bun install` instead of `npm install`, `yarn install`, or `pnpm install`.
- Use `bun run <script>` in place of `npm run <script>` or similar commands.

**Note:** Bun auto-loads `.env` in development.  
Do **not** rely on this behavior in the published CLI.

### 10.2 Runtime API Requirements

All shipped CLI code must be portable across Node and Bun.  
Do **not** use Bun-specific runtime APIs.

#### Forbidden Runtime APIs

The following must never appear in CLI code:

- `Bun.serve()`
- `bun:sqlite`
- `Bun.redis`
- `Bun.sql`
- `Bun.file`
- `` Bun.$`command` `` (template shell runner)

### Node Built-ins

Use Node’s standard built-in modules without the `node:` prefix.

**Allowed:**

```ts
import fs from 'fs/promises';
import path from 'path';
import process from 'process';
```

Do not use Bun-specific runtime APIs (`Bun.file`, `Bun.write`, etc.).

Runtime code must never assume the existence of Bun globals.

**Package selection:** Prefer cross-runtime dependencies. Avoid Bun-only polyfills or APIs unless isolated to tests; if uncertain about compatibility, ask for review before adding the package.

### 10.3 Testing

Bun’s test runner is allowed for **tests only**:

```ts
// index.test.ts
import { test, expect } from 'bun:test';

test('example', () => {
  expect(1).toBe(1);
});
```
