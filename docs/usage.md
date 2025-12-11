# Bluprint CLI Usage

Bluprint evaluates feature work against a spec and architecture rules. The CLI is intentionally small: each command validates its inputs, calls safe wrappers for Git and filesystem work, and returns structured results rather than throwing.

## Available Commands

### `init`

- Purpose: scaffold a `.bluprint` directory in the current git repo, move the provided spec into it, and record the base branch to compare against.
- Options:
- `--spec <path>` (required) – path to an existing YAML spec file. Must point to a file, not a directory.
  - `--base <branch>` (required) – git branch to use as the baseline for future evaluations.
- Workflow:
  1. Resolve repo root via git.
  2. Verify the spec path exists and is a file.
  3. Fetch/prune remotes and confirm the base branch exists.
  4. Create `.bluprint/`, write `config.json` with `base` and `specPath` via `configUtils`, and move the spec to `.bluprint/spec/spec.yaml`.
  5. (Placeholder) validate the spec file contents.
- Example usage:
- `bluprint init --spec ./feature-spec.yaml --base main`
  - `bluprint init --spec ../docs/specs/onboarding.md --base release/1.2.0`
- Expected output:
  - Success: `Success: Bluprint configuration initialized successfully (command: init)`
  - Errors are printed with a code and hint, and the process sets a non-zero exit code without throwing.

### `rules`

- Purpose: discover rule files and write `.bluprint/rules/index.json` with summaries (id/description/tags/path).
- Options:
  - `--rules-source <embedded|directory>` (required) – choose embedded file search vs directory scan.
  - `--rules-embedded-file <name>` – required when `--rules-source=embedded`; file name to find anywhere in the repo (e.g., `AGENTS.md`).
  - `--rules-dir <path>` – required when `--rules-source=directory`; directory to scan recursively for rule files.
  - `--json` – output JSON-only mode; otherwise prints a brief success message.
- Behavior:
  1. Load `.bluprint/config.json`.
  2. Discover rule files (embedded: `findByName` for the given filename; directory: recursive scan). Filters `.md/.mdc/.yaml/.yml` and dedupes repo-relative paths.
  3. Summarize each rule via the agent runtime (LLM) into description + tags; tolerate fenced JSON responses.
  4. Write `.bluprint/rules/index.json` with RuleReferences.
- Example:
  - Embedded: `bluprint rules --rules-source=embedded --rules-embedded-file=AGENTS.md`
  - Directory: `bluprint rules --rules-source=directory --rules-dir=.agent`
- Validation:
  - Requires exactly one source mode; missing mode-specific flag fails with `VALIDATION_ERROR`.
  - Errors are emitted via AppError codes; no throws.

### `plan`

- Purpose: generate an execution plan from the workspace specification by breaking it down into actionable tasks with assigned rules.
- Options:
  - `--json` – output JSON-only mode; otherwise prints task titles in the success message.
- Behavior:
  1. Load `.bluprint/config.json`.
  2. Load workspace specification from `.bluprint/spec/spec.yaml`.
  3. Load rules index from `.bluprint/rules/index.json`.
  4. Invoke the plan agent (LLM) to break down the specification into tasks, where each task:
     - Has a unique ID, title, and detailed instructions
     - Is assigned at least one rule from the rules index for context
     - May include scope (files/globs), acceptance criteria, and dependencies
  5. Write the generated plan to `.bluprint/state/plan.json`.
- Example:
  - Standard output: `bluprint plan`
  - JSON output: `bluprint plan --json`
- Expected output:
  - Success: `Generated plan with N task(s).` (plus task titles unless `--json` is used)
  - Errors if workspace spec or rules index is missing/invalid
- Validation:
  - Specification must include either `constraints` or `implementation_patterns.guidelines` to provide guardrails
  - Rules index must exist and contain at least one rule
  - Errors are emitted via AppError codes; no throws.

### `index`

- Purpose: generate a semantic index of codebase files with LLM-powered descriptions for faster project understanding.
- Arguments:
  - `[directory]` (optional, defaults to `.`) – directory to index; defaults to entire repository when omitted or set to `.`.
- Options:
  - `--json` – output JSON-only mode; otherwise prints a success message with file count.
- Behavior:
  1. Load `.bluprint/config.json`.
  2. Discover files in the specified directory (or entire repo) using git-tracked files, excluding binary/non-text files.
  3. Generate concise descriptions (~200 characters) for each file using the LLM.
  4. Write the index to `.bluprint/codebase/semantic_index.json` with timestamp and file descriptions, or output to stdout if `--json` is used.
- Example:
  - Index entire repo: `bluprint index` or `bluprint index .`
  - Index specific directory: `bluprint index src`
  - JSON output: `bluprint index --json`
  - JSON for directory: `bluprint index src --json`
- Expected output:
  - Success: `Indexed N file(s).` (plus file paths unless `--json` is used)
  - Errors if config is missing or LLM fails
- Implementation details:
  - Uses `git ls-files` to respect `.gitignore` automatically
  - Excludes 75+ binary file extensions (images, videos, audio, documents, archives, executables, databases, fonts)
  - Descriptions are trimmed and capped at 200 characters for efficiency
  - Files are processed sequentially with rate limiting to avoid API throttling
