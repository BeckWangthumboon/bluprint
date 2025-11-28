# Bluprint CLI Usage

Bluprint evaluates feature work against a spec and architecture rules. The CLI is intentionally small: each command validates its inputs, calls safe wrappers for Git and filesystem work, and returns structured results rather than throwing.

## Available Commands

### `init`
- Purpose: scaffold a `.bluprint` directory in the current git repo, move the provided spec into it, and record the base branch to compare against.
- Options:
  - `--spec <path>` (required) – path to an existing markdown spec file. Must point to a file, not a directory.
  - `--base <branch>` (required) – git branch to use as the baseline for future evaluations.
- Workflow:
  1) Resolve repo root via git.
  2) Verify the spec path exists and is a file.
  3) Fetch/prune remotes and confirm the base branch exists.
  4) Create `.bluprint/`, write `config.json` with `base` and `specPath`, and move the spec to `.bluprint/spec.md`.
  5) (Placeholder) validate the spec file contents.
- Example usage:
  - `bluprint init --spec ./feature-spec.md --base main`
  - `bluprint init --spec ../docs/specs/onboarding.md --base release/1.2.0`
- Expected output:
  - Success: `Success: Bluprint configuration initialized successfully (command: init)`
  - Errors are printed with a code and hint, and the process sets a non-zero exit code without throwing.
