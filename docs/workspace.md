# Bluprint Configuration

Configuration lives under `.bluprint/` and anchors the local workspace cache for a project version.

## File Locations

- `.bluprint/config.json` – primary configuration file. Written by `bluprint init` via `configUtils.writeConfig`.
- `.bluprint/spec/spec.yaml` – feature spec file moved in by `bluprint init` (format defined in `docs/spec-format.md`).
- `.bluprint/rules/index.json` – machine-readable rules index (rule content lives outside `.bluprint`).
- `.bluprint/state/plan.json` – persisted plan output from `bluprint plan`.
- `.bluprint/state/evaluations/last.json` – latest evaluation output.

## `config.json` Schema

```json
{
  "base": "main",
  "version": "0.0.0",
  "workspace": {
    "root": ".bluprint",
    "specPath": ".bluprint/spec/spec.yaml",
    "rules": {
      "root": ".bluprint/rules",
      "indexPath": ".bluprint/rules/index.json"
    },
    "state": {
      "root": ".bluprint/state",
      "planPath": ".bluprint/state/plan.json",
      "evaluationsRoot": ".bluprint/state/evaluations",
      "latestEvaluationPath": ".bluprint/state/evaluations/last.json"
    }
  }
}
```

- `base` (string) – git branch used as the comparison baseline for evaluations.
- `version` (string) – workspace version marker for migrations and future cloud sync. Current release requires `0.0.0`.
- `workspace` (object) – repo-relative layout of the workspace cache.
  - `root` – workspace root (defaults to `.bluprint`).
  - `specPath` – spec file location inside the workspace.
  - `rules` – rules storage layout (`root`, `indexPath`).
  - `state` – task/evaluation storage layout (`planPath`, `evaluationsRoot`, `latestEvaluationPath`).

## Rules and Assumptions

- Paths are normalized to the git repo root; commands must reject traversal outside the repository.
- `bluprint init` is the source of truth for writing/updating this file; other commands should read but not mutate it directly.
- `configUtils.ensureWorkspace` scaffolds the workspace tree and placeholder files (rules index, plan, latest evaluation) without overwriting existing content.
- `workspaceRules` APIs manage reads/writes for `rules/index.json`; rule bodies should be stored outside the `.bluprint` workspace.
- `workspacePlan` APIs manage reads/writes for `state/plan.json`:

