# Bluprint

Bluprint is a Bun-based CLI for spec-driven code generation. It runs a small agent loop that plans work from a spec, implements one step at a time, reviews each step, commits accepted changes, and saves the run for inspection or resume.

## What It Does

Given a spec file, Bluprint:

1. Caches the spec in `.bluprint/cache/spec.md`.
2. Generates a numbered implementation plan.
3. Generates a short plan summary for coding context.
4. Runs a coding agent on the current plan step.
5. Runs a review agent that either accepts the work or returns correction instructions.
6. Commits accepted changes automatically.
7. Archives the run to `.bluprint/runs/<runId>/`.

The result is a Git-backed, resumable execution loop instead of a single one-shot prompt.

## Agent Architecture

Bluprint uses five agent roles:

- `plan`: turns the spec into a numbered plan saved to `plan.md`
- `summarizer`: condenses the plan into `summary.md`
- `coding`: implements exactly one plan step at a time
- `master`: reviews the current step and returns strict JSON accept/reject output
- `commit`: generates the commit message for accepted work

The coding agent receives:

- the plan summary
- the current step
- nearby step headers for context
- retry instructions from `task.md` when a step was rejected

The master agent reviews:

- the original spec
- the current step
- the coding report
- `git status`
- the current diff
- retry state

If a step is rejected, Bluprint writes correction instructions to `task.md` and retries the same step on the next iteration.

## How The Loop Works

At a high level, `bluprint run` does this:

1. Resolve config and the selected preset.
2. Load the spec into the active cache.
3. Generate `plan.md` and `summary.md`.
4. Initialize loop state from numbered plan headers like `## 1`, `## 2`, and so on.
5. Execute the current step with the coding agent.
6. Review the result with the master agent.
7. On accept, stage, generate a commit message, and commit.
8. On reject, save feedback and retry.
9. Repeat until all steps complete or limits are hit.

Loop state is persisted in `.bluprint/cache/state.json` and includes:

- current step
- step statuses
- retry flag
- iteration count
- time and iteration limits
- commit hashes for completed steps
- attempt history for resumed runs

## Resume

Resume restores a previous archived run back into the active cache and starts a new attempt from the next pending or failed step.

```bash
bun run index.ts run --resume <runId>
```

On resume, Bluprint:

1. Restores `spec.md`, `plan.md`, `summary.md`, and `state.json` from `.bluprint/runs/<runId>/`.
2. Clears transient `task.md` and `report.md`.
3. Resets the worktree before continuing.
4. Opens a new execution attempt in state.

Important: resume uses Git restore/clean behavior before continuing. Do not assume uncommitted local changes will survive a resumed run.

## Features

- Multi-command CLI: `run`, `models`, `presets`, `config`
- Per-agent model presets for `coding`, `master`, `plan`, `summarizer`, and `commit`
- Full-run, plan-only, build-only, and resume modes
- Automatic Git commits for accepted steps
- Optional Graphite stacked branch flow
- Persistent telemetry and archived run artifacts

## Setup

Prerequisites:

- Bun
- A Git repository
- OpenCode installed locally
- OpenCode SDK access through `@opencode-ai/sdk`
- Provider credentials already authenticated in OpenCode for the models you plan to use
- Valid provider/model IDs

Install dependencies:

```bash
bun install
```

Add models:

```bash
bun run index.ts models add \
  --model openai/gpt-4o-mini \
  --model anthropic/claude-3-5-sonnet
```

Create a preset:

```bash
bun run index.ts presets add \
  --name default \
  --coding openai/gpt-4o-mini \
  --master openai/gpt-4o-mini \
  --plan anthropic/claude-3-5-sonnet \
  --summarizer openai/gpt-4o-mini \
  --commit openai/gpt-4o-mini
```

Set the default preset:

```bash
bun run index.ts presets default --name default --yes
```

## Usage

Write a spec:

```md
# Goal
Add a new CLI subcommand to export run summaries as JSON.

# Constraints
- Keep current behavior backward compatible.
- Validate output with zod.
```

Run planning only:

```bash
bun run index.ts run --plan --spec spec.md
```

Run the full pipeline:

```bash
bun run index.ts run --spec spec.md
```

Run build-only from cached plan:

```bash
bun run index.ts run --build
```

Use a specific preset:

```bash
bun run index.ts run --spec spec.md --preset default
```

Enable Graphite:

```bash
bun run index.ts run --spec spec.md --graphite
```

## CLI Reference

Run commands:

```bash
bun run index.ts run --spec spec.md
bun run index.ts run --plan --spec spec.md
bun run index.ts run --build
bun run index.ts run --resume <runId>
```

Model commands:

```bash
bun run index.ts models list
bun run index.ts models add --model openai/gpt-4o-mini
bun run index.ts models remove --model openai/gpt-4o-mini
bun run index.ts models validate --verbose
```

Preset commands:

```bash
bun run index.ts presets list
bun run index.ts presets add --name default ...
bun run index.ts presets edit --name default --coding openai/gpt-4o-mini
bun run index.ts presets remove --name default --yes
bun run index.ts presets default --name default --yes
```

Config commands:

```bash
bun run index.ts config list
bun run index.ts config get limits.maxIterations
bun run index.ts config set limits.maxIterations 30
bun run index.ts config set limits.maxTimeMinutes 20
bun run index.ts config set specFile docs/spec.md
bun run index.ts config set graphite.enabled true
bun run index.ts config reset limits.maxIterations
bun run index.ts config reset --all
```

## Run Artifacts

Bluprint writes under `.bluprint/`:

- `.bluprint/config/`: config and model definitions
- `.bluprint/cache/spec.md`: active spec
- `.bluprint/cache/plan.md`: generated plan
- `.bluprint/cache/summary.md`: generated summary
- `.bluprint/cache/state.json`: loop state
- `.bluprint/cache/task.md`: retry instructions
- `.bluprint/cache/report.md`: coding agent report
- `.bluprint/runs/<runId>/manifest.md`: run summary
- `.bluprint/runs/<runId>/agents/*.md`: per-iteration agent logs
- `.bluprint/runs/<runId>/...`: archived spec, plan, summary, and state

Successful runs remove transient `task.md` and `report.md`. Failed or aborted runs keep them for debugging.

## Project Structure

```text
src/
├── agent/         # agent wrappers and prompts
├── cli/           # CLI command handlers
├── config/        # config schemas, validation, resolution
├── git/           # git and Graphite operations
├── logging/       # debug and session logging
├── orchestration/ # loop, state, commit orchestration
├── sdk/           # OpenCode SDK wrapper
├── telemetry/     # manifests and agent call logs
├── fs.ts
├── shell.ts
├── workspace.ts
└── exit.ts
```

## Development

```bash
bun run typecheck
bun run lint
bun run lint:fix
bun run format
bun run format:check
bun test
bun run check
```

## Notes

- Bluprint expects to run inside a Git repository.
- Accepted work is committed automatically, and the commit flow stages all current changes with `git add -A`. Run Bluprint from a clean working tree if you do not want unrelated edits included.
- Graphite support requires the `gt` CLI.
- Model validation happens before agent execution.
- OpenCode must be installed and available locally.
- Models must already be usable through your local OpenCode setup; Bluprint does not perform provider auth for you.
- `run --spec <path>` moves the spec into `.bluprint/cache/spec.md`.
- `run --build` requires an existing cached `plan.md` and `summary.md`.
- `run --resume` resets the worktree before continuing and can remove uncommitted or untracked local changes.

## License

This repository does not currently include a standalone license file.
