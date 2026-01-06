## Task

Create Config Read/Write Utilities

## Work Completed & Feedback

- Feedback: None provided.
- Summary: Created `src/config/io.ts` with 9 functions for reading and writing config files. Functions handle JSON parsing, Zod schema validation, and proper error conversion using neverthrow's ResultAsync type. Config directory constants and helper functions for comparing and formatting ModelConfig objects were also implemented.

## Code Changes

- `src/config/io.ts`: Created new file with getConfigDir, getConfigFilePath, ensureConfigDir, readBluprintConfig, writeBluprintConfig, readModelsConfig, writeModelsConfig, modelConfigEquals, formatModelConfig

## Scope Verification

- `src/config/io.ts`: Required for Task 3 - provides all read/write utilities for config files as specified

## Tests/Verification

- Ran `bun tsc --noEmit` - passed with no type errors

## Risks/Follow-ups

None
