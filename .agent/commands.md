# Bluprint Command Rules

Applies to: `src/index.ts`, `src/commands/*`, CLI argument wiring, command registrations.

This document defines rules for the command layer in Bluprint, which serves as the orchestration boundary between the CLI interface and the core domain logic.

---

## Hard Constraints

### 1. Centralized Registration in index.ts

All CLI commands must be registered in `src/index.ts` using Yargs. Each command must live in its own file under `src/commands/` and be imported explicitly.

**Purpose:** Ensures discoverability, maintains clear entry points, and prevents ad-hoc command creation.

**Allowed Registration Pattern:**

```ts
// In src/index.ts
import { check } from './commands/check.js';

yargs(hideBin(process.argv)).command<CheckArgs>(
  'check',
  'Evaluate the current branch against the Bluprint spec',
  (cmd) => cmd,
  async (argv) => {
    const result = await check(argv);
    result.match(displaySuccess, displayError);
  },
);
```

**Forbidden Direct Invocation:**

```ts
// Incorrect: calling lib directly without command module
async () => {
  await configUtils.loadConfig(); // Bypasses command layer
};
```

### 2. Orchestration-Only Layer

Command handlers must orchestrate only: collect arguments, call domain functions, and route results to output. They must never perform domain logic directly.

**Allowed Orchestration:**

```ts
async (argv) => {
  const result = await evaluateBranch(argv);
  result.match(displaySuccess, displayError);
};
```

**Forbidden Domain Work:**

```ts
async (argv) => {
  const content = await fs.readFile(argv.spec, 'utf8'); // Direct FS access
  const parsed = YAML.parse(content); // Direct parsing
};
```

### 3. Centralized Output Through lib/exit

All user-facing output must go through `displaySuccess` and `displayError` in `src/lib/exit.ts`. No direct console operations in handlers.

**Allowed Output:**

```ts
// Return structured data
const successInfo: SuccessInfo = {
  command: 'init',
  message: 'Bluprint configuration initialized successfully',
  details: [`Config written to ${configPath}`],
};
return ok(successInfo);
```

**Forbidden Direct Output:**

```ts
console.log('Init complete'); // Direct logging
console.error('Failed: ', error.message); // Direct error output
```

### 4. Yargs-Level Validation

All argument validation must happen in the Yargs builder using `demandOption`, type checking, and validation functions.

**Allowed Validation:**

```ts
cmd.option('spec', {
  type: 'string',
  description: 'Path to the spec YAML file',
  demandOption: true,
});
cmd.option('base', {
  type: 'string',
  description: 'Base git branch to work from',
  default: 'main',
});
```

**Forbidden Manual Validation:**

```ts
// Don't validate arguments in the handler
if (!argv.spec) {
  throw new Error('spec is required');
}
```

### 5. File Naming and Export Rules

Command files must use kebab-case for the command name and export a single handler function with the same name.

**Allowed:**

- `src/commands/check.ts` exports `check`
- `src/commands/feature-diff.ts` exports `featureDiff`

**Forbidden:**

- Multiple handlers in one command file
- Exporting unrelated utilities from command modules

### 6. Strict TypeScript Interfaces

All command arguments must have corresponding TypeScript interfaces in `src/types/commands.ts` with explicit typing.

**Allowed Type Definition:**

```ts
export interface CheckArgs {
  spec?: string; // Optional: read from config
  base?: string; // Optional: read from config
  json?: boolean; // Optional: output mode
  rules?: string[]; // Optional: specific rules to run
}
```

**Forbidden Loose Typing:**

```ts
export interface Args {
  [key: string]: any; // Never use index signatures
}
```

---

## Soft Constraints

### 7. Handler Size and Focus

Keep handlers short (around 30 lines) and focused on wiring; factor any branching or retries into lib functions.

**Example (preferred):**

```ts
// Move validation branches into src/lib/checks.ts
const result = await checksService.validateBranch(argv);
```

**Example (avoid):**

```ts
// Multiple conditional branches inside the handler
if (argv.strict) {
  // validation logic here
} else {
  // other validation logic here
}
```

### 8. Flag Naming Consistency

Document flags with clear descriptions and defaults in the Yargs builder; prefer predictable flag names that mirror lib inputs.

**Example (preferred):**

- Flags `spec` and `base` matching `InitArgs`
- Consistent naming across commands

**Example (avoid):**

- Exposing `--branch` when the lib expects `base`
- Inconsistent flag names for similar concepts

### 9. Structured Success Payloads

Prefer returning structured success payloads (e.g., `SuccessInfo`) rather than raw strings, then format centrally.

**Example (preferred):**

```ts
return {
  command: 'init',
  message: 'Bluprint initialized',
  configPath,
};
```

**Example (avoid):**

```ts
return 'init ok'; // Raw string
```

### 10. Stable JSON Output Shapes

When a command supports `--json`, the output shape must remain stable across invocations. Use structured types defined in `src/types/commands.ts`.

**Allowed JSON Structure:**

```ts
interface CheckResult {
  violations: RuleViolation[];
  summary: {
    total: number;
    blocking: number;
    warning: number;
  };
  branch: string;
  base: string;
}
```

**Forbidden Shape Changes:**

```ts
// Changing output structure based on runtime conditions
if (argv.verbose) {
  output.includeDetails = true;
} else {
  output.includeDetails = undefined;
}
```

---

## Process

### 11. Adding New Commands

When adding a new command, follow exact sequence:

1. **Define the arguments interface** in `src/types/commands.ts`
2. **Create the command handler** in `src/commands/<name>.ts`
3. **Implement domain logic** in the appropriate `src/lib/` module, or using existing modules.
4. **Register the command** in `src/index.ts` with Yargs
5. **Add tests** under `tests/unit/commands/` or `tests/integration/`

### 12. Propagating New Requirements

When existing functionality needs new parameters:

1. **Add to the argument interface** in `src/types/commands.ts`
2. **Update the Yargs builder** in `src/index.ts`
3. **Pass through the command handler** without using the value
4. **Consume in the lib module** where the behavior is implemented

### 13. Output Evolution

When changing output formats:

1. **Update the SuccessInfo interface** in `src/lib/exit.ts`
2. **Modify displaySuccess** to render new fields appropriately
3. **Update displayError** if error formatting changes
4. **Add JSON output support** in the relevant formatter if applicable
