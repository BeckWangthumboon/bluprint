# Error Handling

Bluprint never throws from application code. All failures are represented as `Result<T, AppError>` or `ResultAsync<T, AppError>` and surfaced to the CLI with deterministic exit codes.

## AppError Shape
- Defined in `src/types/errors.ts` with:
  - `code: AppErrorCode` – stable category identifier.
  - `message: string` – actionable description for users.
  - `details?: unknown` – optional context (stderr, paths, args).
- `createAppError(code, message, details?)` builds an `AppError` for neverthrow chains.

## Error Codes
- `FS_ERROR` – filesystem failure (write, rename, mkdir) inside the repo root.
- `FS_NOT_FOUND` – missing or inaccessible path.
- `CONFIG_NOT_FOUND` / `CONFIG_PARSE_ERROR` – configuration file missing or invalid.
- `GIT_ERROR` – git interaction failed unexpectedly.
- `GIT_NOT_REPO` – current directory is not inside a git repository.
- `GIT_COMMAND_FAILED` – git command returned a non-zero status with stderr content.
- `LLM_ERROR` – upstream LLM failures (reserved for future commands).
- `VALIDATION_ERROR` – domain validation failed (e.g., spec/config validation).
- `UNKNOWN` – catch-all for uncategorized failures.

## Flow With neverthrow
- Library functions return `ResultAsync` and compose via `.andThen`, `.map`, `.orElse` without throwing.
- Callers propagate errors unchanged or map them to more specific `AppError` instances when adding context.
- CLI handlers unwrap Results and delegate presentation to `displayError`; they do not throw.

## CLI Presentation
- `src/lib/exit.ts` maps `AppErrorCode` to exit codes (user errors: 1, system errors: 2, git repo errors: 3, unknown: 4).
- `displayError` prints a formatted message with hints and sets `process.exitCode`; `displaySuccess` prints success messages without altering exit codes.
- Errors include serialized `details` when provided to aid debugging while keeping user-facing hints concise.
