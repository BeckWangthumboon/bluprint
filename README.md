# Bluprint

A Bun-based CLI that orchestrates AI agents to plan, implement, review, and commit code from a written spec.

[![Status](https://img.shields.io/badge/status-placeholder-lightgrey)](#project-status) [![Build](https://img.shields.io/badge/build-placeholder-lightgrey)](#project-status) [![Coverage](https://img.shields.io/badge/coverage-placeholder-lightgrey)](#project-status)

## Project Status

- TODO: Add real status badges (CI, release, coverage) once available.

## Table of Contents

- [Motivation](#motivation)
- [What It Does](#what-it-does)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Architecture](#architecture)
- [Development and Testing](#development-and-testing)
- [Roadmap](#roadmap)
- [Reflection and Learnings](#reflection-and-learnings)
- [License](#license)

## Motivation

- TODO: Why you built Bluprint.
- TODO: What workflow pain this replaces.
- TODO: Who this is for (solo devs, teams, experiments).

## What It Does

Bluprint runs an agent loop over a spec file:

1. Generates a structured plan.
2. Summarizes the plan for coding context.
3. Iterates through plan steps with coding + review agents.
4. Accepts/rejects each step and commits accepted changes.
5. Archives run state and artifacts for traceability and resume.

## Features

- Multi-command CLI via `yargs` (`run`, `models`, `presets`, `config`).
- Configurable model pool and per-agent presets (`coding`, `master`, `plan`, `summarizer`, `commit`).
- Three run modes: full run, plan-only, build-only.
- Resume support from persisted run artifacts (`run --resume <runId>`).
- Iterative orchestration with loop limits (`maxIterations`, `maxTimeMinutes`).
- Automatic Git commit generation per accepted plan step.
- Optional Graphite stacked branch flow (`--graphite`).
- Telemetry artifacts per run (`manifest.md`, per-iteration agent logs).

## Installation

### Prerequisites

- Bun (project uses Bun scripts and `bun.lock`).
- Git repository context (build loop stages/commits changes).
- OpenCode SDK runtime access (`@opencode-ai/sdk`) and valid provider/model IDs.

### Setup

```bash
# 1) Install dependencies
bun install

# 2) Add models to pool
bun run index.ts models add --model openai/gpt-4o-mini --model anthropic/claude-3-5-sonnet

# 3) Create a preset for all agents
bun run index.ts presets add \
  --name default \
  --coding openai/gpt-4o-mini \
  --master openai/gpt-4o-mini \
  --plan anthropic/claude-3-5-sonnet \
  --summarizer openai/gpt-4o-mini \
  --commit openai/gpt-4o-mini

# 4) Set default preset
bun run index.ts presets default --name default --yes
```

## Usage

### 1) Create a spec

By default, Bluprint reads `spec.md` (or your configured `specFile`).

```bash
cat > spec.md <<'EOF_SPEC'
# Goal
Add a new CLI subcommand to export run summaries as JSON.

# Constraints
- Keep current command behavior backward compatible.
- Validate output schema with zod.
EOF_SPEC
```

### 2) Run planning only

Generates `.bluprint/cache/plan.md` and `.bluprint/cache/summary.md`.

```bash
bun run index.ts run --plan --spec spec.md
```

### 3) Run full pipeline (plan + build loop)

```bash
bun run index.ts run --spec spec.md
```

### 4) Build-only from an existing plan

Useful after a prior planning run.

```bash
bun run index.ts run --build
```

### 5) Use a specific preset

```bash
bun run index.ts run --spec spec.md --preset default
```

### 6) Enable Graphite stacked branches

```bash
bun run index.ts run --spec spec.md --graphite
```

### 7) Resume a previous run

Resumes from `.bluprint/runs/<runId>/` artifacts.

```bash
bun run index.ts run --resume run-1700000000000-ab12cd
```

### Configuration and model management

```bash
# Model pool
bun run index.ts models list
bun run index.ts models validate --verbose
bun run index.ts models remove --model openai/gpt-4o-mini

# Presets
bun run index.ts presets list
bun run index.ts presets edit --name default --coding anthropic/claude-3-5-sonnet
bun run index.ts presets remove --name default --yes

# General config
bun run index.ts config list
bun run index.ts config set limits.maxIterations 30
bun run index.ts config set limits.maxTimeMinutes 20
bun run index.ts config set specFile docs/spec.md
bun run index.ts config set graphite.enabled true
bun run index.ts config reset limits.maxIterations
bun run index.ts config reset --all
```

## Architecture

### High-level flow

`index.ts` routes CLI commands. For `run`, Bluprint executes:

1. Resolve runtime config (`src/config/resolve.ts`) and selected preset.
2. Load/move spec into `.bluprint/cache/spec.md` (`src/cli/run.ts`).
3. Plan phase (`src/agent/planAgent.ts`):
   - generate `plan.md`
   - generate `summary.md` via summarizer agent
4. Build loop (`src/orchestration/loop.ts`):
   - initialize or resume `state.json`
   - execute coding agent for current step
   - execute master agent review (`accept`/`reject`)
   - on accept, generate commit message and commit (normal Git or Graphite)
   - update loop state and iterate until all steps complete or limits fail
5. Archive artifacts into `.bluprint/runs/<runId>/`.

### Module breakdown

- `src/cli/*`: Command handlers for `run`, `models`, `presets`, `config`.
- `src/agent/*`: Agent wrappers and prompt orchestration.
- `src/agent/prompts/*.txt`: System prompts for each agent role.
- `src/orchestration/*`: Loop state machine, retries, limits, commit orchestration.
- `src/config/*`: Zod schemas, config file I/O, default resolution, runtime preset resolution.
- `src/git/*`: Staging, commit operations, optional Graphite branch creation.
- `src/sdk/*`: OpenCode SDK wrapper with session lifecycle/error handling.
- `src/telemetry/*`: Run manifest and per-iteration agent logs.
- `src/workspace.ts`: Path constants and cache/run artifact movement.

### Run artifacts

Bluprint writes under `.bluprint/`:

- `.bluprint/config/bluprint.config.json`: General settings and default preset.
- `.bluprint/config/models.json`: Model pool + named presets.
- `.bluprint/cache/spec.md`: Active spec input.
- `.bluprint/cache/plan.md`: Generated plan.
- `.bluprint/cache/summary.md`: Generated summary for coding context.
- `.bluprint/cache/state.json`: Loop state machine snapshot.
- `.bluprint/cache/task.md`: Master-agent feedback for retries (temporary).
- `.bluprint/cache/report.md`: Latest coding-agent report (temporary).
- `.bluprint/runs/<runId>/manifest.md`: Run summary with iteration metrics.
- `.bluprint/runs/<runId>/agents/*.md`: Per-iteration coding/master logs.
- `.bluprint/runs/<runId>/spec.md`, `plan.md`, `summary.md`, `state.json`: Archived core run files.
- `.bluprint/runs/<runId>/task.md`, `report.md`: Included on failed/aborted runs; removed on successful finalization.

## Development and Testing

```bash
# Type checking
bun run typecheck

# Linting
bun run lint
bun run lint:fix
bun run lint:clean

# Formatting
bun run format
bun run format:check

# Tests
bun test

# Combined checks
bun run check
```

## Roadmap

- TODO: Add upcoming milestones.
- TODO: Call out near-term priorities (stability, evals, DX, integrations).
- TODO: Link issues/projects once public.

## Reflection and Learnings

- TODO: What worked well.
- TODO: What surprised you.
- TODO: What you would redesign next.

## License

- TODO: Add license type and `LICENSE` file.
