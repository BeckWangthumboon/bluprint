# Bluprint Lib Rules

Applies to: `src/lib/*` (config, fs, git, spec, exit, future modules) and shared helpers they own.

---

## Hard Constraints

### 1. Never Throw - Use Result/ResultAsync Pattern

Lib functions must never throw; all IO and parsing flows use `Result`/`ResultAsync<AppError>` with the shared `AppError` shape from `src/types/errors.ts`.

**Purpose:** Ensures predictable error handling and prevents uncaught exceptions in domain logic.

**Allowed Pattern:**
```ts
// From src/lib/fs.ts
const fsWriteFile = (target: string, data: string) =>
  resolvePathWithinRepo(target).andThen((normalized) =>
    ResultAsync.fromPromise(
      fs.writeFile(normalized, data, 'utf8'),
      (error) =>
        createAppError(
          'FS_ERROR',
          `Unable to write file at ${normalized}: ${(error as Error).message}`,
          { path: normalized },
        ),
    ),
  );
```

**Forbidden Pattern:**
```ts
// Incorrect: throwing directly from lib function
function writeConfig(config: unknown) {
  try {
    const json = JSON.stringify(config);
    fs.writeFileSync('config.json', json); // Synchronous and throws
  } catch (error) {
    throw new Error(`Failed to write: ${error.message}`); // Never throw
  }
}
```

### 2. Wrapper-Only IO Operations

All filesystem and git calls must go through centralized wrappers (`fsUtils` in `src/lib/fs.ts`, `gitUtils` in `src/lib/git.ts`). No direct `fs` or raw `git` in other lib modules.

**Purpose:** Centralizes path normalization, error handling, and maintains repository boundaries.

**Allowed Wrapper Usage:**
```ts
// In src/lib/config.ts
const loadConfig = (): ResultAsync<BluprintConfig, AppError> =>
  fsUtils
    .fsReadFile(CONFIG_FILE_PATH)
    .andThen((contents) => parseConfig(contents));
```

**Forbidden Direct Access:**
```ts
// Incorrect: bypassing wrappers in lib module
import fs from 'fs/promises';

async function readSpec(path: string) {
  const content = await fs.readFile(path); // Direct FS access
  return content;
}
```

### 3. Path Normalization and Repository Boundaries

All paths must be normalized relative to repository root and traversal outside must be rejected using helpers like `resolvePathWithinRepo` (`src/lib/fs.ts`).

**Purpose:** Prevents accidental file access outside the repository and ensures consistent path handling.

**Allowed Path Handling:**
```ts
// From src/lib/fs.ts
const resolvePathWithinRepo = (target: string) =>
  gitUtils.gitGetRepoRoot().andThen((repoRoot) => {
    const candidate = path.resolve(repoRoot, target);
    const relative = path.relative(repoRoot, candidate);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return err(
        createAppError('FS_ERROR', `Path ${target} is outside repository root`),
      );
    }

    return ok(candidate);
  });
```

**Forbidden Traversal:**
```ts
// Incorrect: allowing path traversal
const dangerousPath = '../../../etc/passwd';
const fullPath = path.join(process.cwd(), dangerousPath); // Can escape repo
```

### 4. Strict Layering and Import Boundaries

Lib modules may import from `src/types/*` but never from commands or CLI entrypoints. This maintains clean dependency flow.

**Purpose:** Ensures one-directional dependencies and prevents circular imports.

**Allowed Imports:**
```ts
// In src/lib/config.ts
import { fsUtils } from '../lib/fs.js';
import { gitUtils } from '../lib/git.js';
import type { BluprintConfig } from '../types/commands.js';
```

**Forbidden Boundary Violations:**
```ts
// Incorrect: importing from command layer
import { displaySuccess } from '../lib/exit.js'; // OK - same layer
import { init } from '../commands/init.js'; // Wrong - reverse dependency
import yargs from 'yargs'; // CLI concern, not lib
```

### 5. Stable Error Code Usage

Preserve stable error codes and messages; reuse existing codes (`FS_ERROR`, `GIT_ERROR`, `CONFIG_PARSE_ERROR`, etc.) and introduce new ones deliberately.

**Purpose:** Ensures consistent error handling and stable exit codes for CLI consumers.

**Allowed Error Reuse:**
```ts
// Reusing established error codes
return err(
  createAppError('FS_NOT_FOUND', `Configuration file not found at ${CONFIG_FILE_PATH}`)
);
```

**Forbidden Arbitrary Errors:**
```ts
// Incorrect: inventing per-call error codes
return err(
  createAppError('CONFIG_READ_FAILED', 'Could not read config') // Not in AppErrorCode union
);
```

---

## Soft Constraints

### 6. Focused, Single-Purpose Helpers

Prefer small, single-purpose helpers in each module and expose only the minimal public surface.

**Purpose:** Improves testability, reduces complexity, and enables targeted reuse.

**Preferred Pattern:**
```ts
// Focused helpers in src/lib/git.ts
export const gitUtils = {
  gitFetchPrune,       // One specific git operation
  gitGetRepoRoot,       // Single responsibility
  gitCheckBranchExists,   // Clear purpose
  gitGetDiffAgainst,      // Well-defined behavior
};
```

**Avoided Pattern:**
```ts
// Avoided: catch-all utility mixing concerns
export const gitAndFsUtils = {
  fetchAndRead,    // Mixes git and FS
  copyAndCommit,    // Multiple operations
  validateAndWrite,  // Coupled concerns
};
```

### 7. Cautious Caching with Reset Hooks

Cache cautiously and provide reset hooks for tests when using module-level state.

**Purpose:** Enables performance optimization while maintaining test isolation.

**Preferred Pattern:**
```ts
// From src/lib/git.ts
let cachedRepoRoot: string | null = null;

const gitGetRepoRoot = () => {
  if (cachedRepoRoot) return okAsync(cachedRepoRoot);
  // ... caching logic
};

// Test helper for reset
export const gitTestHelpers = {
  resetRepoRootCache: () => { cachedRepoRoot = null; },
};
```

**Avoided Pattern:**
```ts
// Avoided: hidden cache with no reset mechanism
let expensiveCache = new Map();

function computeExpensiveValue(input: string) {
  if (expensiveCache.has(input)) {
    return expensiveCache.get(input); // No way to clear for tests
  }
  // ... compute and cache
}
```

### 8. Boundary-Focused Input Validation

Keep input validation close to the boundary where data enters the system.

**Purpose:** Ensures data integrity and provides clear error messages at entry points.

**Preferred Pattern:**
```ts
// From src/lib/spec.ts - validate at parse boundary
const parseOverview = (input: unknown): Result<Overview, AppError> => {
  if (!isRecord(input) || !isNonEmptyString(input.summary)) {
    return err(
      createAppError(
        'VALIDATION_ERROR',
        'overview.summary is required and must be a non-empty string'
      ),
    );
  }
  // ... rest of validation
};
```

**Avoided Pattern:**
```ts
// Avoided: validation scattered through logic
function processSpec(rawSpec: unknown) {
  const spec = rawSpec as any; // Unsafe assumption
  if (spec.overview?.summary) { // Validation happens during processing
    // ... handle case
  }
}
```

### 9. Extend Existing Modules Before Creating New Ones

When adding new operations, favor extending existing utility modules before creating cross-cutting helpers.

**Purpose:** Reduces module surface area and maintains focused responsibilities.

**Preferred Pattern:**
```ts
// Adding to existing fsUtils
export type FsUtils = {
  // ... existing methods
  fsCopy: (from: string, to: string) => ResultAsync<void, AppError>;
  fsChmod: (path: string, mode: number) => ResultAsync<void, AppError>;
};
```

**Avoided Pattern:**
```ts
// Avoided: creating generic helpers module
// src/lib/helpers.ts - mixes unrelated utilities
export const copyFile = (from: string, to: string) => { /* FS logic */ };
export const parseJson = (text: string) => { /* Parsing logic */ };
export const validateEmail = (email: string) => { /* Validation logic */ };
```

---

## Process

### 10. Adding New Lib Capabilities

When adding a new lib capability: define the Result shape and error codes first; implement using existing wrappers or add a new wrapper with path normalization and `AppError` mapping; add unit tests covering success, not-found, and error cases.

**Required Steps:**
1. **Define Result Shape and Error Codes** - Create or reuse appropriate `AppError` codes
2. **Use Existing Wrappers** - Leverage `fsUtils`, `gitUtils`, or create new wrapper
3. **Implement Path Normalization** - Ensure all paths go through `resolvePathWithinRepo`
4. **Add Comprehensive Tests** - Cover success, not-found, permission, and error scenarios
5. **Export Focused API** - Only expose necessary functions through module exports

**Example Implementation:**
```ts
// Adding fsCopy functionality
const fsCopy = (from: string, to: string): ResultAsync<void, AppError> =>
  resolvePathWithinRepo(from)
    .andThen((normalizedFrom) =>
      resolvePathWithinRepo(to).andThen((normalizedTo) =>
        ResultAsync.fromPromise(
          fs.cp(normalizedFrom, normalizedTo, { recursive: true }),
          (error) =>
            createAppError(
              'FS_ERROR',
              `Unable to copy ${normalizedFrom} to ${normalizedTo}: ${(error as Error).message}`,
              { from: normalizedFrom, to: normalizedTo }
            )
        )
      )
    );
```

### 11. Introducing New Wrappers

When creating a new wrapper: document preconditions in a header comment, normalize inputs to repo root, and map failures to actionable `AppError` messages. Add reset/test hooks if caching or global state is introduced.

**Wrapper Template Requirements:**
- Header comment with purpose, parameters, returns, and error behavior
- Path normalization using `resolvePathWithinRepo`
- All async operations wrapped in `ResultAsync.fromPromise`
- Error mapping to appropriate `AppError` codes with actionable messages
- Test helpers for any cached state

**Example Wrapper:**
```ts
/**
 * Creates a temporary directory within the repository for test operations.
 *
 * @param prefix - Optional prefix for the temporary directory name.
 * @returns ResultAsync resolving to the created temp directory path.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const fsCreateTempDir = (prefix = 'bluprint-temp'): ResultAsync<string, AppError> =>
  gitUtils.gitGetRepoRoot().andThen((repoRoot) => {
    const tempDir = path.join(repoRoot, '.bluprint', `${prefix}-${Date.now()}`);
    return fsMkdir(tempDir).andThen(() => ok(tempDir));
  });
```

### 12. Evolving Config/Spec Handling

When changing config/spec handling: keep parsing and validation pure (no FS inside parsing). Use `fsUtils` to read/write, convert `FS_NOT_FOUND` to domain-specific errors when appropriate, and keep error text user-actionable.

**Evolution Guidelines:**
1. **Separate Parsing from I/O** - Validation functions accept `unknown`, not file paths
2. **Domain-Specific Error Mapping** - Convert `FS_NOT_FOUND` to `CONFIG_NOT_FOUND` or `SPEC_NOT_FOUND`
3. **User-Actionable Messages** - Error messages should suggest specific fixes
4. **Maintain Backwards Compatibility** - Add new optional fields rather than breaking existing structure

**Example Evolution:**
```ts
// Adding validation for new spec field
const parseSpecification = (input: unknown): Result<Specification, AppError> => {
  // Existing validation
  const overview = parseOverview(input.overview);
  if (overview.isErr()) return overview;

  // New field validation
  const dependencies = parseDependencies(input.dependencies);
  if (dependencies.isErr()) return dependencies;

  return ok({
    overview: overview.value,
    dependencies: dependencies.value, // New optional field
    // ... existing fields
  });
};
```

### 13. Git Wrapper Evolution and Safety

When changing git behavior: guard destructive commands, ensure repo-root detection is reused, and keep `gitUtils` the single gateway for git access.

**Safety Requirements:**
- Always run git operations from repository root unless explicitly overridden
- Guard against destructive operations (`reset --hard`, `clean -fd`, force push)
- Reuse `gitGetRepoRoot()` to maintain consistent working directory
- Provide explicit options for dangerous operations with clear documentation

**Example Safe Pattern:**
```ts
// Adding a new git operation
const gitCreateBranch = (branchName: string, fromBranch?: string): ResultAsync<void, AppError> =>
  gitGetRepoRoot()
    .andThen(() => gitCheckBranchExists(branchName))
    .andThen((exists) => {
      if (exists) {
        return err(
          createAppError(
            'GIT_ERROR',
            `Branch '${branchName}' already exists`,
            { branch: branchName }
          )
        );
      }
      return ok(void 0);
    })
    .andThen(() => {
      const args = fromBranch
        ? ['checkout', '-b', branchName, fromBranch]
        : ['checkout', '-b', branchName];
      return gitRun(args);
    });
```
