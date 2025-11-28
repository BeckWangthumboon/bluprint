# Bluprint CLI

Bluprint is a TypeScript CLI that evaluates feature branches against a spec and architecture rules.

## Prerequisites

- Bun installed (`curl -fsSL https://bun.sh/install | bash`) or via your package manager.
- Git available on PATH.
- Node-compatible environment (bun or node)

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```
2. (Optional) Run the test suite to verify your setup:
   ```bash
   bun run test
   ```

## Usage

- Help:
  ```bash
  bun src/index.ts --help
  ```
- Initialize Bluprint in a repo:
  ```bash
  bluprint init --spec ./feature-spec.md --base main
  ```
- Full command details live in `usage.md`.

## Development Notes

- Commands use safe wrappers in `src/lib/` and neverthrow Results; errors are presented via `displayError` with deterministic exit codes.
- Tests use Vitest; integration tests spin up temporary git repos and require git on PATH.

## Documentation

- `usage.md` – command behaviors and examples.
- `architecture.md` – source layout and responsibilities.
- `errors.md` – error model and exit mapping.
- `docs/testing.md` – how to run tests and coverage notes.
- `docs/rules/rules.md` – contributor rules and coding standards.
