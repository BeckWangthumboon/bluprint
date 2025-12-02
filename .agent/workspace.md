# Bluprint Workspace Rules

Applies to: `.bluprint/` workspace layout, workspace config handling, and rules/state cache interactions.

## Hard Constraints

- Workspace paths are repo-relative and anchored to `.bluprint/`; do not allow traversal outside the repo root.
- Config version is pinned to `0.0.0` for the current release; reject other versions until migration is added.
- Spec lives at `.bluprint/spec/spec.yaml`; rules storage is index-only (`.bluprint/rules/index.json`). Rule bodies must live outside the workspace.
- Always read/write config via `configUtils.loadConfig` / `configUtils.writeConfig` and scaffold via `configUtils.ensureWorkspace`; do not bypass with direct fs.
- Use `workspaceRules` APIs for rule index reads/writes; do not manipulate the index file directly.

## Soft Constraints

- Keep workspace surface minimal: prefer extending existing paths/config fields rather than adding new files under `.bluprint/`.
- When adding new workspace data, define defaults in `configUtils.createDefaultConfig` and keep tests in `tests/unit/lib/workspace/`.

## Process

- Validate new workspace fields via `parseConfig` and reuse existing error codes (`CONFIG_PARSE_ERROR`, `CONFIG_NOT_FOUND`, `FS_ERROR`).
