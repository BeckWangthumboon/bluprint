# AGENTS.md

This file provides guidance for AI coding agents working in this repository.

## Project Overview

Bluprint is a TypeScript CLI tool built with Bun that orchestrates AI agents for automated code generation and planning. It uses the OpenCode SDK to execute coding, planning, and review agents in a loop-based workflow.

## Build/Lint/Test Commands

### Type Checking

```bash
bun run typecheck       # Run TypeScript type checking
```

### Formatting

```bash
bun run format          # Format all files with Prettier
bun run format:check    # Check formatting without modifying files
```

### Linting

```bash
bun run lint            # Run ESLint with zero warnings allowed
bun run lint:fix        # Run ESLint and automatically fix issues
bun run lint:clean      # Run ESLint without cache
```

### Running the CLI

```bash
bun run index.ts run --spec <path>           # Run full pipeline
bun run index.ts run --plan                  # Generate plan only
bun run index.ts run --build                 # Execute build only
bun run index.ts models list                 # List model pool
bun run index.ts config presets list         # List model presets
```

### No Test Framework

This project does not currently have a test runner configured. Validate changes using `bun run typecheck` and manual CLI testing.

## Code Style Guidelines

### Import Style

- Use ES module imports with `.js` extensions for local files (required by verbatimModuleSyntax)
- Use `import type` for type-only imports
- Group imports: external packages first, then local modules
- Prefer named exports over default exports

```typescript
// Correct import patterns
import { ResultAsync, err } from 'neverthrow';
import { z } from 'zod';
import type { ModelConfig } from '../config/schemas.js';
import { workspace } from '../workspace.js';
```

### Naming Conventions

- **Files**: `camelCase.ts` (e.g., `codingAgent.ts`, `planUtils.ts`)
- **Functions**: `camelCase` - use descriptive verbs (e.g., `readState`, `parseTextResponse`)
- **Types/Interfaces**: `PascalCase` (e.g., `LoopState`, `ModelConfig`)
- **Constants**: `SCREAMING_SNAKE_CASE` for module-level constants, `camelCase` for local
- **Schemas**: Suffix with `Schema` (e.g., `ModelConfigSchema`, `BluprintConfigSchema`)

### Error Handling

This codebase uses **neverthrow** for type-safe error handling. Follow these patterns:

```typescript
import { ResultAsync, err, errAsync, ok } from 'neverthrow';

// Wrap async operations in ResultAsync
const readFile = (path: string): ResultAsync<string, Error> =>
  ResultAsync.fromPromise(fs.readFile(path, 'utf8'), toError);

// Chain operations with andThen
const result = readFile(path)
  .andThen((content) => parseContent(content))
  .mapErr((e) => new Error(`Failed to process: ${e.message}`));

// Combine multiple ResultAsync operations
ResultAsync.combine([op1(), op2(), op3()]).andThen(([a, b, c]) => ...);

// Standard error converter
const toError = (e: unknown): Error =>
  e instanceof Error ? e : new Error(String(e));
```

### Type Definitions with Zod

Define schemas with Zod and infer types from them:

```typescript
import { z } from 'zod';

export const ModelConfigSchema = z.object({
  providerID: z.string().min(1),
  modelID: z.string().min(1),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;
```

### Function Style

- Use arrow functions with `const` for all function definitions
- Use explicit return types for public functions
- Prefer functional composition over imperative loops

```typescript
// Preferred style
export const executeCodingAgent = (
  iteration: number,
  signal: AbortSignal,
  config: CodingAgentConfig
): ResultAsync<string, Error> => {
  // implementation
};
```

### Async Patterns

- Use `AbortSignal` for cancellable operations
- Wrap timeouts with the `withTimeout` utility from `src/agent/utils.ts`
- Handle abort signals at the start of async functions

```typescript
if (signal.aborted) {
  return errAsync(new Error('Operation aborted'));
}
```

### File Organization

```
src/
├── agent/           # AI agent implementations
│   ├── prompts/     # System prompts for agents (.txt files)
│   ├── codingAgent.ts
│   ├── masterAgent.ts
│   └── ...
├── cli/             # CLI command handlers
│   └── config/      # Config subcommands
├── config/          # Configuration schemas, I/O, validation
├── exit.ts          # Global abort handling
├── fs.ts            # File system utilities (ResultAsync wrappers)
├── shell.ts         # Shell command execution
├── state.ts         # Loop state management
└── workspace.ts     # Workspace path management
```

### Comments and Documentation

- Use JSDoc comments for exported functions with `@param` and `@returns`
- Keep comments concise and focused on "why" not "what"
- Document complex algorithms or non-obvious logic

## Key Dependencies

| Package            | Purpose                                    |
| ------------------ | ------------------------------------------ |
| `neverthrow`       | Type-safe error handling with Result types |
| `zod`              | Schema validation and type inference       |
| `yargs`            | CLI argument parsing                       |
| `@clack/prompts`   | Interactive CLI prompts                    |
| `@opencode-ai/sdk` | OpenCode AI agent SDK                      |

## Other patterns

### Export at the Bottom

Place all exports at the end of the file after defining all functions and objects:

```typescript
const readTask = (): ResultAsync<string, Error> => fsUtils.readFile(TASK_MD_FILE);
const writeTask = (content: string): ResultAsync<void, Error> =>
  fsUtils.writeFile(TASK_MD_FILE, content);

const workspace = {
  cache: {
    task: {
      read: readTask,
      write: writeTask,
    },
  },
};

export { workspace, workspaceConstants, archiveCacheToRun };
```

### Grouping Functions in Objects

For modules with many related functions, group them together in a namespace object:

```typescript
const readFile = (filePath: string): ResultAsync<string, Error> =>
  ResultAsync.fromPromise(fs.readFile(filePath, { encoding: 'utf8' }), toError);

const writeFile = (filePath: string, data: string): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(fs.writeFile(filePath, data), toError);

const removeFile = (filePath: string): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(fs.rm(filePath, { force: true }), toError);

export const fsUtils = {
  readFile,
  writeFile,
  removeFile,
  // ... other file operations
};
```

This pattern improves discoverability and keeps the module's public API clear.
