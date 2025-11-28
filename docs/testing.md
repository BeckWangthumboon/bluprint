# Testing Guide

## Running Tests
- Prerequisites: Bun (for scripts), Git installed and on PATH.
- Full suite: `bun run test` (runs `vitest run` across unit and integration suites).
- Focused file: `bun run test -- tests/unit/lib/fs.test.ts`.
- Watch mode (during development): `bunx vitest watch` or `bunx vitest watch tests/unit/lib/git.test.ts`.

## What the Tests Cover
- Unit tests:
  - `src/lib/fs.ts` path normalization, read/write/move behavior, and rejection of paths outside the repo.
  - `src/lib/git.ts` branch existence checks and repo root resolution with git environment variables.
  - `src/lib/exit.ts` formatting and exit code mapping for success/error output.
- Integration tests:
  - `src/commands/init.ts` end-to-end behavior against a temporary git repo, including config creation, spec relocation, and error cases for missing specs, missing branches, and non-repo execution.

## Gotchas
- Git binary required: tests spawn real `git` commands when setting up temp repos.
- Filesystem side effects: tests create temporary directories under the OS temp folder; cleanup is handled by the OS, but runs may leave trace directories during debugging.
- Repo root dependency: filesystem helpers resolve paths relative to the detected git root; mocks often override `gitGetRepoRoot` in tests, so keep that stubbed when adding new cases.
- No `.bluprint` prerequisite: tests create their own `.bluprint` directories as needed; the working tree of the project does not need to contain one.
