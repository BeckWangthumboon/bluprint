# Bluprint Architecture

Bluprint is a TypeScript CLI that layers responsibilities to keep the entrypoint thin, commands focused on orchestration, and reusable logic in dedicated libraries.

## Source Layout

- `src/index.ts` – CLI entrypoint using Yargs. Registers commands, wires argument definitions, and delegates execution to command handlers. Handles success/error display via `displaySuccess` and `displayError`.
- `src/commands/**` – Command implementations (`init`, `rules`, etc.). Each validates CLI arguments, checks relevant Git state, prepares required files or directories, coordinates with library and agent layers, and returns structured results for success or error.
- `src/agent/**` – Agent layer for LLM access (runtime factories, provider registry, agent helpers like rule summarization). Keeps LLM calls out of `src/lib/**`.

## Library Layer (`src/lib`)

- `fs.ts` – Repository-scoped filesystem helpers (`fsMkdir`, `fsMove`, `fsCheckAccess`, `fsStat`, `fsReadFile`, `fsWriteFile`). All paths are normalized to the repo root and wrapped in `ResultAsync` with `AppError` mapping.
- `git.ts` – Safe Git wrappers (`gitFetchPrune`, `gitCheckBranchExists`, `gitGetRepoRoot`, `ensureInsideGitRepo`). Uses child processes, caches the repo root, and returns `ResultAsync` errors with stable codes.
- `exit.ts` – Presentation helpers for CLI output. Maps `AppErrorCode` values to deterministic exit codes and formats success/error messages for stdout/stderr.
- `utils.ts` – Shared utilities: `isRecord` (type guard for plain objects), `safeJsonParse` (neverthrow wrapper for JSON.parse).
- `rules/**`: discover.ts (find/filter rule files), normalize.ts (build/summarize RuleReferences), manifest.ts (write rules index manifest).
- `workspace/**`: config.ts (load/write workspace config), spec.ts (load workspace spec), rules.ts (load/write rules index), plan.ts (load/write plan file).


## Shared Types (`src/types`)

- `errors.ts` – Defines `AppErrorCode` and `AppError`, plus `createAppError` to build structured errors for neverthrow flows.
- `commands.ts` – Typed argument shapes for command handlers

## Tests (`tests`)

- `unit/` – Covers isolated behavior: filesystem/git wrappers, exit formatting, rules discovery/normalization, agent runtime/summarizer, CLI validation.
- `integration/` – Exercises commands end-to-end against temp repos.
- `helpers/` – Utilities for tests, including temporary git repo setup and spec file creation.

## Execution Flow

1. `bluprint` binary (symlinked to `src/index.ts`) starts the Yargs CLI.
2. Yargs parses args and invokes the matching command handler.
3. Command handlers call lib functions, which rely on safe wrappers and return `ResultAsync<*, AppError>`.
4. Results are unwrapped in the handler; successes print via `displaySuccess`, and failures surface through `displayError` with mapped exit codes.
