# Bluprint Architecture

Bluprint is a TypeScript CLI that layers responsibilities to keep the entrypoint thin, commands focused on orchestration, and reusable logic in dedicated libraries.

## Source Layout
- `src/index.ts` – CLI entrypoint using Yargs. Registers commands, wires argument definitions, and delegates execution to command handlers. Handles success/error display via `displaySuccess` and `displayError`.
- `src/commands/init.ts` – Implements the `init` command. Validates CLI args, checks Git state, prepares `.bluprint/`, writes config, moves the spec file, and returns structured success info.

## Library Layer (`src/lib`)
- `fs.ts` – Repository-scoped filesystem helpers (`fsMkdir`, `fsMove`, `fsCheckAccess`, `fsStat`, `fsReadFile`, `fsWriteFile`). All paths are normalized to the repo root and wrapped in `ResultAsync` with `AppError` mapping.
- `git.ts` – Safe Git wrappers (`gitFetchPrune`, `gitCheckBranchExists`, `gitGetRepoRoot`, `ensureInsideGitRepo`). Uses child processes, caches the repo root, and returns `ResultAsync` errors with stable codes.
- `exit.ts` – Presentation helpers for CLI output. Maps `AppErrorCode` values to deterministic exit codes and formats success/error messages for stdout/stderr.

## Shared Types (`src/types`)
- `errors.ts` – Defines `AppErrorCode` and `AppError`, plus `createAppError` to build structured errors for neverthrow flows.
- `commands.ts` – Typed argument shapes for command handlers (currently `InitArgs`).

## Tests (`tests`)
- `unit/` – Covers isolated library behavior: filesystem wrappers, git wrappers, and exit formatting/exit codes.
- `integration/` – Exercises the `init` command end-to-end against a temporary git repo and spec file.
- `helpers/` – Utilities for tests, including temporary git repo setup and spec file creation.

## Execution Flow
1) `bluprint` binary (symlinked to `src/index.ts`) starts the Yargs CLI.
2) Yargs parses args and invokes the matching command handler.
3) Command handlers call lib functions, which rely on safe wrappers and return `ResultAsync<*, AppError>`.
4) Results are unwrapped in the handler; successes print via `displaySuccess`, and failures surface through `displayError` with mapped exit codes.
