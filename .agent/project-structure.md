# Bluprint Project Structure Rules

Applies to: repository layout, directory creation, and import boundaries across `src/*`, `tests/*`, `docs/*`, `.agent/*`.

This document defines the architectural constraints and organizational patterns that ensure maintainable code structure and clear dependency flow.

---

## Hard Constraints

### 1. Import Layer Boundaries

Maintain strict layering: `src/index.ts` may import commands/lib/types; `src/commands/*` may import lib/types; `src/lib/*` may import types; `src/types/*` import nothing else. Tests may import anything but should respect production boundaries when asserting behavior.

**Purpose:** Ensures one-directional dependencies and prevents circular imports.

**Allowed Import Flow:**

```ts
// Command importing from lib and types
// src/commands/init.ts
import { fsUtils } from '../lib/fs.js';
import { gitUtils } from '../lib/git.js';
import type { InitArgs } from '../types/commands.js';
```

**Forbidden Reverse Dependency:**

```ts
// Incorrect: lib importing from command layer
// src/lib/config.ts
import { displaySuccess } from '../lib/exit.js'; // OK - same layer
import { init } from '../commands/init.js'; // Wrong - reverse dependency
```

### 2. Runtime Code Organization

All runtime code must live under `src/` in the appropriate layer (commands/lib/types); avoid ad-hoc folders that bypass wrappers or layering.

**Purpose:** Maintains clear separation between shipped code and development artifacts.

**Allowed Structure:**

```
src/
├── index.ts          # CLI entrypoint
├── commands/          # CLI command handlers
│   ├── init.ts
│   └── check.ts
├── lib/               # Domain logic and wrappers
│   ├── config.ts
│   ├── fs.ts
│   ├── git.ts
│   └── spec.ts
└── types/             # Shared type definitions
    ├── commands.ts
    └── errors.ts
```

**Forbidden Ad-Hoc Folders:**

```ts
// Incorrect: creating utilities that mix concerns
src/utils/              # Bypasses established layers
src/helpers/            # Unclear responsibility
src/shared/             # Mixes command and lib logic
```

### 3. Centralized IO Wrappers

Filesystem, git, and configuration access must stay in designated modules: `src/lib/fs.ts`, `src/lib/git.ts`, `src/lib/config.ts`, `src/lib/spec.ts`.

**Purpose:** Centralizes path normalization, error handling, and maintains consistent patterns.

**Allowed Wrapper Usage:**

```ts
// Using centralized wrappers
import { fsUtils } from '../lib/fs.js';
import { gitUtils } from '../lib/git.js';

const readSpec = (path: string) => fsUtils.fsReadFile(path);
const checkBranch = (branch: string) => gitUtils.gitCheckBranchExists(branch);
```

**Forbidden Direct Access:**

```ts
// Incorrect: bypassing wrappers
import fs from 'fs/promises';
import { exec } from 'child_process';

const readFile = (path: string) => fs.readFile(path); // Direct FS access
const runGit = (args: string[]) => exec('git', args); // Raw git execution
```

---

## Soft Constraints

### 4. Module Growth and Organization

Prefer extending existing folders before creating new top-level lib subfolders; split only when a module becomes dense or has distinct responsibilities.

**Purpose:** Reduces cognitive overhead and maintains focused module boundaries.

**Preferred Growth Pattern:**

```ts
// Keep adding to existing module
// src/lib/git.ts
export const gitUtils = {
  // ... existing helpers
  gitCreateBranch, // New helper added here
  gitGetCommitMessage, // Another new helper
  gitListFiles, // And another
};
```

**Avoided Premature Splitting:**

```ts
// Avoided: creating subfolder too early
src/lib/git/
├── index.ts           # Re-exports everything
├── fetch.ts           # Single helper
├── checkout.ts         # Single helper
└── diff.ts            # Single helper
```

### 5. Aligned Naming Conventions

Keep file names aligned with responsibilities (e.g., `exit.ts` for CLI exit/display helpers, `spec.ts` for spec parsing/validation).

**Purpose:** Improves discoverability and makes intent clear from file names.

**Preferred Naming:**

```ts
// Clear, responsibility-aligned names
src/lib/config.ts      # Configuration handling
src/lib/exit.ts        # CLI output and exit handling
src/lib/spec.ts        # Specification parsing and validation
src/lib/checks.ts     # Validation and rule checking
```

**Avoided Generic Names:**

```ts
// Avoided: unclear scope from filename
src/lib/helpers.ts       # What kind of helpers?
src/lib/utils.ts         # Too generic
src/lib/common.ts        # What is common?
src/lib/operations.ts    # What operations?
```

### 6. Co-Located Test Organization

When adding new domains, co-locate their tests under `tests/unit/<domain>/` or `tests/integration/` rather than scattering fixtures.

**Purpose:** Maintains test proximity to implementation and reduces search overhead.

**Preferred Test Structure:**

```
tests/
├── unit/
│   ├── lib/
│   │   ├── fs.test.ts      # Tests for src/lib/fs.ts
│   │   ├── git.test.ts     # Tests for src/lib/git.ts
│   │   └── spec.test.ts    # Tests for src/lib/spec.ts
│   └── commands/
│       └── init.test.ts  # Tests for src/commands/init.ts
├── integration/
│   ├── init.test.ts         # Full CLI init workflow
│   └── check.test.ts        # Full CLI check workflow
└── fixtures/
    ├── specs/              # Test specification files
    └── repos/              # Test git repositories
```

**Avoided Scattered Tests:**

```
tests/
├── test-fs.ts          # Unclear what this tests
├── git-tests.ts         # Poor naming convention
├── helpers/             # Mixes test helpers with tests
├── temp/                # Temporary files mixed in
└── __mocks__/          # Not following Vitest conventions
```

---

## Process

### 7. Adding New Features

When adding a new feature: decide the layer first (command vs lib vs types); add a command file and handler only for CLI entry, push logic into a lib module, and place shared shapes in `src/types`.

**Required Steps:**

1. **Determine Layer Placement** - Command for CLI, lib for domain logic, types for shared contracts
2. **Create Type Definitions** - Add to appropriate file in `src/types/`
3. **Implement Domain Logic** - Add to appropriate module in `src/lib/`
4. **Create Command Handler** - Add orchestration-only handler in `src/commands/`
5. **Wire in Index.ts** - Register with Yargs in `src/index.ts`
6. **Add Tests** - Place under appropriate test directory

**Example Implementation:**

```ts
// Adding a 'check' command

// 1. Types - src/types/commands.ts
export interface CheckArgs {
  spec?: string;  // Optional: read from config
  base?: string;  // Optional: read from config
  json?: boolean; // Optional: output mode
}

// 2. Domain Logic - src/lib/checks.ts
export const validateBranch = (args: CheckArgs): ResultAsync<CheckResult, AppError> => {
  // Implementation using fsUtils, gitUtils, etc.
};

// 3. Command Handler - src/commands/check.ts
export const check = (argv: CheckArgs): ResultAsync<SuccessInfo, AppError> => {
  // Orchestration only
  return validateBranch(argv);
};

// 4. Registration - src/index.ts
.command<CheckArgs>(
  'check',
  'Evaluate the current branch against the Bluprint spec',
  (cmd) => cmd,
  async (argv) => {
    const result = await check(argv);
    result.match(displaySuccess, displayError);
  },
)
```

### 8. Introducing New Lib Areas

When introducing a new lib area: start as a module under `src/lib/<name>.ts`; if it grows beyond a couple of focused utilities, consider a subfolder with an index that re-exports public functions.

**Growth Guidelines:**

- Start as single file with focused exports
- Split into subfolder when file exceeds ~300 lines or has distinct sections
- Use index.ts to re-export public API and keep implementation private
- Add unit tests in `tests/unit/lib/<name>.test.ts`

**Example Evolution:**

```ts
// Phase 1: Single file
// src/lib/analytics.ts
export const analyticsUtils = {
  parseMetrics: (data: string) => { /* ... */ },
  generateReport: (metrics: Metrics) => { /* ... */ },
};

// Phase 2: Split when growing
// src/lib/analytics/
├── index.ts        # Re-exports: parseMetrics, generateReport
├── metrics.ts      # parseMetrics implementation
├── report.ts       # generateReport implementation
└── types.ts        # Internal types for analytics
```

### 9. Reorganization and Migration

When reorganizing: update imports to preserve boundaries and add/reset tests/fixtures in the matching scope. Keep docs (`.agent/*.md`, `docs/*`) in sync with the layout so agents know where to place new code.

**Migration Checklist:**

1. **Plan New Structure** - Design target hierarchy and boundaries
2. **Move Files** - Preserve Git history with `git mv`
3. **Update Imports** - Fix all import paths after moves
4. **Re-run Tests** - Ensure all tests pass after reorganization
5. **Update Documentation** - Modify `.agent/*` files and `docs/*` to reflect new structure
6. **Verify Boundaries** - Confirm no layer violations exist

**Example Reorganization:**

```ts
// Before: Multiple concerns in one file
// src/lib/operations.ts
export const copyFile = (from: string, to: string) => {
  /* FS logic */
};
export const parseYaml = (content: string) => {
  /* Parsing logic */
};
export const runCommand = (cmd: string) => {
  /* Git logic */
};

// After: Properly separated
// src/lib/fs.ts - copyFile
// src/lib/spec.ts - parseYaml
// src/lib/git.ts - runCommand

// Update imports across codebase
// Old: import { operations } from '../lib/operations.js';
// New: import { fsUtils } from '../lib/fs.js';
```
