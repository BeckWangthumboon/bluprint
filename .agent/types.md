# Bluprint Types Rules

Applies to: `src/types/*` (errors, commands, spec, shared type definitions).

This document defines rules for TypeScript type definitions that serve as contracts between layers in the Bluprint codebase.

---

## Hard Constraints

### 1. Import-Free Type Definitions

Types must not import from commands or lib; keep them free of runtime dependencies and side effects.

**Purpose:** Ensures types remain pure data contracts without executable behavior.

**Allowed Type Dependencies:**
```ts
// src/types/commands.ts
export interface CheckArgs {
  spec?: string;
  base?: string;
}

// src/types/errors.ts
export interface AppError {
  code: AppErrorCode;
  message: string;
  details?: unknown;
}

// Allowed: importing other type files
import type { AppError } from './errors.js';
export type InitResult = {
  success: boolean;
  error?: AppError;
};
```

**Forbidden Runtime Dependencies:**
```ts
// Incorrect: importing executable code
import { fsUtils } from '../lib/fs.js';  // Runtime wrapper
import { gitUtils } from '../lib/git.js';  // Git operations
import yargs from 'yargs';                      // CLI library

// Incorrect: executing code during type definition
const config = loadConfig(); // Side effect during module load
export type ConfigWithDefaults = typeof config;
```

### 2. Explicit and Stable Type Shapes

Use explicit, stable type shapes for public contracts (e.g., `AppError`, `InitArgs`, spec model types). No `any` (implicit or explicit).

**Purpose:** Ensures type safety and predictable contracts across the codebase.

**Allowed Explicit Typing:**
```ts
// Stable, explicit interfaces
export interface InitArgs {
  spec: string;      // Required string
  base: string;      // Required string
  json?: boolean;    // Optional boolean
}

export type BluprintConfig = {
  base: string;     // Explicit string type
  specPath: string;  // Explicit string type
};
```

**Forbidden Loose Typing:**
```ts
// Incorrect: using any or implicit types
export type ConfigData = Record<string, any>;  // Loose values
export interface LooseArgs {
  [key: string]: any;                           // Index signature
  spec: any;                                      // Any type
}

// Incorrect: implicit return types
function parseSpec(content: string) {
  return JSON.parse(content);  // Implicit 'any' return
}
```

### 3. Canonical Error Code Management

Preserve canonical error definitions in `src/types/errors.ts`; extend codes deliberately and document new codes before use.

**Purpose:** Ensures consistent error handling across all modules and stable exit codes.

**Allowed Error Code Evolution:**
```ts
// src/types/errors.ts
export type AppErrorCode =
  | 'FS_ERROR'
  | 'FS_NOT_FOUND'
  | 'CONFIG_NOT_FOUND'
  | 'CONFIG_PARSE_ERROR'
  | 'GIT_ERROR'
  | 'GIT_NOT_REPO'
  | 'GIT_COMMAND_FAILED'
  | 'LLM_ERROR'
  | 'VALIDATION_ERROR'
  | 'CONFIG_SCHEMA_ERROR'  // New code added deliberately
  | 'SPEC_NOT_FOUND';    // New code added deliberately;
```

**Forbidden Ad-Hoc Error Codes:**
```ts
// Incorrect: inventing codes without updating central definition
function readFile(path: string): Result<string, AppError> {
  try {
    return fs.readFileSync(path);
  } catch (error) {
    return err({
      code: 'FILE_READ_ERROR',  // Not in AppErrorCode union
      message: error.message,
    });
  }
}
```

### 4. Runtime Alignment

Keep types aligned with runtime expectations: args types must match Yargs builders; spec types must reflect validation in `src/lib/spec.ts`.

**Purpose:** Prevents mismatches between type definitions and actual runtime behavior.

**Allowed Runtime Alignment:**
```ts
// src/types/commands.ts - matches Yargs builder
export interface CheckArgs {
  spec?: string;  // Optional: can be read from config
  base?: string;  // Optional: defaults to 'main'
  json?: boolean;  // Optional: flag for output mode
}

// src/index.ts - Yargs builder
cmd.option('spec', { type: 'string', demandOption: true });
cmd.option('base', { type: 'string', default: 'main' });
cmd.option('json', { type: 'boolean' });
```

**Forbidden Runtime Mismatch:**
```ts
// Incorrect: types don't match actual usage
export interface CheckArgs {
  configPath: string;  // Not exposed in Yargs
  verbose: boolean;     // Named '--quiet' in CLI
  outputFormat: 'json' | 'text';  // Actually a '--json' flag
}
```

---

## Soft Constraints

### 5. Descriptive and Co-Located Naming

Prefer descriptive names reflecting intent (e.g., `BluprintConfig`, `SuccessInfo`) and colocate related exports in a single file before splitting.

**Purpose:** Improves discoverability and makes intent clear from type names.

**Preferred Naming Pattern:**
```ts
// Clear, intent-focused names
export interface BluprintConfig {      // Configuration for the tool
  base: string;                      // Git base branch
  specPath: string;                  // Path to spec file
}

export interface SuccessInfo {          // Result of successful operations
  command: string;                    // Which command succeeded
  message: string;                    // Human-readable success message
  details?: string[];                 // Optional additional context
  nextSteps?: string[];               // Optional guidance for user
}
```

**Avoided Generic Names:**
```ts
// Avoided: unclear or generic type names
export interface Config {              // What kind of config?
export interface Result {              // Success or error?
export interface Options {             // Options for what?
export interface Data {                // What kind of data?
}
```

### 6. Pragmatic Optional Fields

When adding optional fields, favor explicit `| undefined` over loose indexing; avoid deep nesting when a flatter shape is clearer.

**Purpose:** Reduces ambiguity and makes optionality explicit in the type system.

**Preferred Optional Pattern:**
```ts
// Clear optional fields with explicit undefined
export interface CheckArgs {
  spec?: string;           // May be undefined
  base?: string;           // May be undefined
  timeoutMs?: number;       // May be undefined
  rules?: string[];         // May be undefined
}
```

**Avoided Loose Patterns:**
```ts
// Avoided: unclear optionality
export interface ConfigData {
  [key: string]: any;        // Too permissive
  options?: Record<string, unknown>;  // Vague structure
  settings?: {                // Deeply nested without clear contract
    advanced?: {
      debugging?: {
        enabled?: boolean;
        level?: 'trace' | 'debug' | 'info';
      };
    };
  };
}
```

### 7. Focused Type Organization

Keep type files small and cohesive; split only when a file grows past a couple of focused domains.

**Purpose:** Maintains cognitive manageability and clear separation of concerns.

**Preferred Cohesive Organization:**
```ts
// Single file per domain
src/types/
├── errors.ts       # All error-related types
├── commands.ts     # CLI command argument types
├── spec.ts         # Specification-related types
└── index.ts         # Re-exports public API
```

**Avoided Scattered Organization:**
```ts
// Avoided: mixed concerns in single files
src/types/
├── index.ts         # Everything mixed together
├── helpers.ts       # Unclear what this contains
├── utils.ts         # Generic utilities
└── misc.ts          # Catch-all for miscellaneous types
```

---

## Process

### 8. Adding New Command Types

When adding a new args type: define it in `src/types/commands.ts`, keep fields minimal, and mirror defaults/requirements from the CLI builder.

**Required Steps:**
1. **Define Interface** - Create interface with explicit types for all arguments
2. **Match Yargs Builder** - Ensure fields align with CLI option definitions
3. **Export Named Type** - Use descriptive name matching the command
4. **Document Optional Fields** - Clarify which fields have defaults vs. required
5. **Consider Future Extension** - Design for evolution without breaking changes

**Example Implementation:**
```ts
// src/types/commands.ts
export interface CheckArgs {
  spec?: string;        // Optional: read from .bluprint/config.json
  base?: string;        // Optional: defaults to configured base branch
  json?: boolean;        // Optional: output mode flag
  rules?: string[];      // Optional: specific rules to execute
}

// Corresponds to Yargs in src/index.ts
yargs(hideBin(process.argv))
  .command<CheckArgs>(
    'check',
    'Evaluate current branch against Bluprint spec',
    (cmd) => {
      cmd.option('spec', { type: 'string' });
      cmd.option('base', { type: 'string', default: 'main' });
      cmd.option('json', { type: 'boolean' });
      cmd.option('rules', { type: 'string[]', array: true });
    },
    // ... handler
  );
```

### 9. Evolving Error Types

When error handling needs new codes: update `AppErrorCode` union and ensure corresponding lib code maps failures to the new codes with actionable messages.

**Evolution Process:**
1. **Analyze Error Category** - Determine if it's filesystem, git, config, validation, etc.
2. **Choose Appropriate Prefix** - Use existing prefixes (FS_, GIT_, CONFIG_, etc.)
3. **Add to AppErrorCode** - Update the union type with new code
4. **Update createAppError** - Ensure helper accepts the new code
5. **Map in Lib Code** - Update appropriate lib module to use the new code
6. **Update Tests** - Add test cases for the new error scenario

**Example Error Evolution:**
```ts
// Step 1: Add new code to union
// src/types/errors.ts
export type AppErrorCode =
  | 'FS_ERROR'
  | 'FS_NOT_FOUND'
  | 'CONFIG_NOT_FOUND'
  | 'CONFIG_PARSE_ERROR'
  | 'GIT_ERROR'
  | 'GIT_NOT_REPO'
  | 'GIT_COMMAND_FAILED'
  | 'LLM_ERROR'
  | 'VALIDATION_ERROR'
  | 'SPEC_SCHEMA_ERROR'      // NEW: Spec validation structure errors
  | 'SPEC_NOT_FOUND';       // NEW: Spec file missing

// Step 2: Document new error category
/**
 * Error codes for specification-related failures.
 */
export const SPEC_ERRORS = {
  SCHEMA_ERROR: 'SPEC_SCHEMA_ERROR' as const,
  NOT_FOUND: 'SPEC_NOT_FOUND' as const,
} as const;

// Step 3: Use in lib module
// src/lib/spec.ts
const validateSchema = (spec: unknown): Result<Specification, AppError> => {
  if (!isValidStructure(spec)) {
    return err(
      createAppError(
        SPEC_ERRORS.SCHEMA_ERROR,
        'Specification must follow required schema structure',
        { received: spec }
      )
    );
  }
  // ... validation logic
};
```

### 10. Maintaining Spec-Related Types

When updating specification structure: adjust both the type definitions and the validators in `src/lib/spec.ts`, then add/adjust unit tests to match the contract.

**Spec Evolution Guidelines:**
1. **Review Existing Usage** - Understand current spec structure and validation
2. **Design Backwards-Compatible Changes** - Add optional fields rather than changing existing ones
3. **Update Type Definitions** - Modify interfaces in `src/types/spec.ts`
4. **Update Validation Logic** - Adjust parsing in `src/lib/spec.ts` to handle new fields
5. **Update Error Handling** - Add new error codes for validation failures
6. **Comprehensive Testing** - Test both new and legacy spec formats

**Example Spec Evolution:**
```ts
// Step 1: Evolving the type
// src/types/spec.ts
export interface Specification {
  overview: Overview;
  constraints?: Constraints;        // Existing field
  motivation?: Motivation;          // Existing field
  acceptanceCriteria?: AcceptanceCriteria;  // NEW: Optional acceptance criteria
}

// Step 2: Updating validation
// src/lib/spec.ts
const parseSpecification = (input: unknown): Result<Specification, AppError> => {
  const overview = parseOverview(input.overview);
  if (overview.isErr()) return overview;

  // NEW: Parse optional acceptance criteria
  let acceptanceCriteria: AcceptanceCriteria | undefined = undefined;
  if (input.acceptanceCriteria !== undefined) {
    const result = parseAcceptanceCriteria(input.acceptanceCriteria);
    if (result.isErr()) return result;
    acceptanceCriteria = result.value;
  }

  return ok({
    overview: overview.value,
    motivation: input.motivation ? parseMotivation(input.motivation).value : undefined,
    acceptanceCriteria,  // New optional field
  });
};
```
