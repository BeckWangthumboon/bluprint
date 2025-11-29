# Bluprint Configuration

This document describes the configuration stored under `.bluprint/`.

## File Locations

- `.bluprint/config.json` – primary configuration file. Written by `bluprint init` via `configUtils.writeConfig`.
- `.bluprint/spec.yaml` – feature spec file moved in by `bluprint init` (format defined in `docs/spec-format.md`).

## `config.json` Schema

```json
{
  "base": "main",
  "specPath": ".bluprint/spec.yaml"
}
```

- `base` (string) – git branch used as the comparison baseline for evaluations.
- `specPath` (string) – repo-relative path to the spec file. Written as a path relative to the repo root to stay stable across environments.

## Rules and Assumptions

- Paths are normalized to the git repo root; commands must reject traversal outside the repository.
- `bluprint init` is the source of truth for writing/updating this file; other commands should read but not mutate it directly.
- Future fields (e.g., rules paths, output modes) should be added here with defaults and migration guidance when introduced.
