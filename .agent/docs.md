# Bluprint Docs & Readmes Rules

Applies to: `README.md`, `docs/**/*`, `.agent/*` guidance files, and any contributor-facing docs.

This document defines standards for maintaining clear, actionable documentation that serves both humans and automated agents.

---

## Hard Constraints

### 1. Intent-Focused Documentation

Keep documentation intent-focused and stable: avoid prompt/recency bleed and "thinking out loud" language; reflect intended behavior, not transient fixes.

**Purpose:** Ensures documentation remains valuable over time by describing stable, long-term behavior rather than temporary fixes or development conversations.

**Allowed Stable Documentation:**

```markdown
<!-- Good: Describes enduring behavior -->

Init copies the provided spec into `.bluprint/spec.yaml` so later commands read a stable spec location. Uses synchronous write to avoid partial writes on non-atomic filesystems.
```

**Forbidden Transient References:**

```markdown
<!-- Bad: Documents temporary fixes or conversations -->

Recently changed this to fix a crash that occurred on Windows.
As discussed in the chat, we now read from `.bluprint`.
Added check from earlier conversation to validate branch names.
```

### 2. Accurate CLI Examples

Ensure examples match current CLI behavior and flags (e.g., `bluprint init --spec <path> --base <branch>`); update docs alongside code changes.

**Purpose:** Prevents user confusion by keeping documentation synchronized with actual CLI behavior.

**Accurate Example Pattern:**

````markdown
## Setup

1. Install dependencies:
   ```bash
   bun install
   ```
````

2. Initialize Bluprint:

   ```bash
   bluprint init --spec ./specs/feature.yaml --base main
   ```

   Success: Bluprint configuration initialized successfully

````

**Inaccurate Example Problems:**
```markdown
<!-- These create confusion for users -->

# Using the wrong flag name
bluprint init --spec-path ./feature.yaml  # Flag doesn't exist

# Quoting an outdated default
bluprint init --base "master"  # Default changed to "main"

# Missing required flags
bluprint init  # Missing --spec flag
````

### 3. Runtime-Aware Documentation

Do not document unsupported runtimes/APIs; only mention Bun for development tooling, not for shipped CLI usage.

**Purpose:** Ensures users understand actual runtime requirements and don't attempt unsupported configurations.

**Runtime-Aware Documentation:**

```markdown
## Development

- Use `bun test` for running the test suite
- Use `bun run <script>` for development scripts defined in package.json

## Production

The CLI requires Node.js 18+ and is fully compatible with Bun runtime.
```

**Runtime-Confusing Documentation:**

```markdown
<!-- These mislead about runtime requirements -->

## Production Setup

- Install Bun to run Bluprint (incorrect: Bun is optional)
- Use `bun:sqlite` for database storage (incorrect: Bun-specific API)
- Deploy with `Bun.serve()` (incorrect: Bun-specific API)
```

### 4. Canonical Error References

When referencing errors, use canonical codes/messages exposed by the app (`AppError` codes).

**Purpose:** Ensures consistent error messaging and helps users map documentation to actual error output.

**Canonical Error Documentation:**

````markdown
## Error Handling

Bluprint uses structured error codes:

- `FS_NOT_FOUND`: File or directory not found
- `CONFIG_NOT_FOUND`: Bluprint configuration missing
- `GIT_ERROR`: Git operation failed
- `VALIDATION_ERROR`: Input validation failed

Example:

```bash
$ bluprint check
Error: Configuration missing. Run `bluprint init` first. (code: CONFIG_NOT_FOUND)
Hint: Verify you're in a Bluprint repository.
```
````

**Non-Canonical References:**

```markdown
<!-- These create mapping difficulties -->

## Common Errors

- "Throws an error" (unhelpful - what error?)
- "File access error" (vague - which code?)
- "Setup failed" (unclear - what failed?)
```

---

## Soft Constraints

### 5. Task-Focused Examples

Provide minimal, task-focused examples rather than exhaustive flag dumps; link to deeper spec files where available.

**Purpose:** Enables users to quickly accomplish specific tasks without overwhelming them with options.

**Task-Focused Example:**

````markdown
## Quick Start

Initialize a new project:

```bash
bluprint init --spec ./my-feature.yaml --base main
```
````

This creates:

- `.bluprint/config.json` with your settings
- `.bluprint/spec.yaml` with your specification

For all options, see: [Configuration Guide](docs/config.md)

````

**Exhaustive Dump (Avoided):**
```markdown
## All Options

bluprint init [options]

Options:
  --spec <path>        Path to specification file (required)
  --base <branch>      Base branch (default: main)
  --force              Overwrite existing config
  --dry-run           Show what would be done
  --verbose            Detailed output
  --json               JSON output
  --help               Show help
  --version            Show version

Examples:
  bluprint init --spec spec.yaml
  bluprint init --spec spec.yaml --base develop
  bluprint init --spec spec.yaml --base main --force
  bluprint init --spec spec.yaml --base main --dry-run --verbose --json
  # ... 20 more examples
````

### 6. Consistent Documentation Structure

Keep structure consistent: short intro, prerequisites, commands/usage, and expected outputs. Prefer tables/lists for flags and outputs.

**Purpose:** Creates predictable documentation experience and makes information easy to scan.

**Consistent Structure Template:**

````markdown
# Command Name

Brief one-sentence description of what the command does.

## Prerequisites

- Requirement 1
- Requirement 2

## Usage

```bash
bluprint <command> [options]
```
````

| Option | Type   | Default | Description       |
| ------ | ------ | ------- | ----------------- |
| --spec | string | -       | Path to spec file |
| --base | string | main    | Base branch       |

## Examples

```bash
# Basic usage
bluprint init --spec ./feature.yaml

# With custom base
bluprint init --spec ./feature.yaml --base develop
```

## Output

Success: Configuration initialized at `.bluprint/config.json`

````

**Inconsistent Structure (Avoided):**
```markdown
# Using This Command

Here's how you use bluprint. First you need to install it. Then you can run the init command which takes a spec file path and optionally a base branch. The spec file should contain your feature specification in YAML format. The base branch defaults to "main" but you can change it. For example, you could run `bluprint init --spec path/to/spec.yaml` or `bluprint init --spec path/to/spec.yaml --base my-feature`. This will create a .bluprint directory with your config and copy the spec file there. If you want to force overwrite existing config, use --force. The command outputs success messages and can also produce JSON if you pass --json.
````

### 7. Aligned Terminology

Mirror naming and terminology from the code (e.g., "base branch", "spec path", "Result" terminology) to reduce ambiguity.

**Purpose:** Ensures users can map documentation directly to code behavior and CLI output.

**Code-Aligned Terminology:**

```markdown
## Configuration

Bluprint stores configuration in `.bluprint/config.json`:

- `base`: The base git branch for comparisons
- `specPath`: Relative path to the specification file

## Errors

The command returns structured errors with codes:

- `FS_NOT_FOUND`: When paths don't exist
- `CONFIG_PARSE_ERROR`: Invalid JSON in config
- `VALIDATION_ERROR`: Input validation failed
```

**Misaligned Terminology (Avoided):**

```markdown
## Settings

The config file contains:

- `mainBranch`: Which branch to use as baseline
- `manifest`: Where feature spec is located

## Problems

- File not found (generic)
- Invalid config (unclear what type)
```

---

## Process

### 8. Updating Documentation After Changes

When code changes affect CLI behavior: revise relevant sections and examples in the same PR; verify commands match the Yargs definitions in `src/index.ts`.

**Update Checklist:**

1. **Identify Changed Behavior** - New flags, defaults, or output formats
2. **Locate Documentation** - Find all references to changed behavior
3. **Update Examples** - Ensure all command examples work with new behavior
4. **Verify Flags Match** - Cross-reference with `src/index.ts` Yargs definitions
5. **Test Updated Docs** - Run examples to confirm they work
6. **Update Related Sections** - Change error docs, usage guides, etc.

**Example Update Process:**

````markdown
<!-- Before: Default was "master" -->

## Usage

```bash
bluprint init --spec ./spec.yaml --base master
```
````

````markdown
<!-- After: Default changed to "main" -->

## Usage

```bash
bluprint init --spec ./spec.yaml --base main
```
````

### 9. Adding New Functionality Documentation

When adding new functionality: include a brief usage snippet, expected outputs (human and JSON if applicable), and note any config/spec requirements.

**Documentation Requirements:**

1. **Command Synopsis** - One-line description of what it does
2. **Usage Examples** - At least one complete, working example
3. **Flag Documentation** - All flags with types, defaults, and descriptions
4. **Output Samples** - Show both human-readable and JSON formats when applicable
5. **Prerequisites** - Any setup or configuration requirements
6. **Error Scenarios** - Common failure modes and their resolutions

**Example New Command Documentation:**

````markdown
## Check Command

Evaluates the current branch against Bluprint specifications.

### Prerequisites

- Must be in a git repository
- Requires initialized Bluprint configuration

### Usage

```bash
bluprint check [--json] [--rules <rules>]
```
````

| Option  | Type     | Default | Description                   |
| ------- | -------- | ------- | ----------------------------- |
| --json  | flag     | false   | Output results in JSON format |
| --rules | string[] | all     | Specific rules to run         |

### Examples

```bash
# Check with human-readable output
bluprint check

# Check with JSON output for automation
bluprint check --json

# Run specific rules only
bluprint check --rules file-naming,import-structure
```

### Output

Human-readable:

```
✓ File naming follows conventions
✗ Import structure violates rules
  - src/utils/index.ts imports from commands (blocking)
2 passed, 1 failed
```

JSON format:

```json
{
  "summary": {
    "total": 15,
    "passed": 14,
    "failed": 1,
    "blocking": 1
  },
  "violations": [
    {
      "rule": "import-structure",
      "severity": "blocking",
      "message": "src/utils/index.ts imports from commands layer",
      "file": "src/utils/index.ts",
      "line": 3
    }
  ]
}
```

### 10. Internal Rules Documentation

For internal agent rules (like `.agent/global.md`), keep Hard/Soft/Process structure and cite code examples where possible to anchor expectations.

**Internal Documentation Standards:**

1. **Clear Scope Statement** - What the rules apply to
2. **Structured Categories** - Hard, Soft, Process sections
3. **Code References** - Link to specific implementations
4. **Actionable Guidance** - Provide "how to apply" not just "what to do"
5. **Examples and Counter-Examples** - Show both correct and incorrect patterns

**Example Internal Rule Documentation:**

````markdown
# Bluprint Type Safety Rules

Applies to: All TypeScript code in the project.

## Hard Constraints

### 1. No Implicit Any

All types must be explicit; never use `any` implicitly or explicitly.

**Correct Implementation:**

```ts
// From src/lib/fs.ts
const readFile = (path: string): ResultAsync<string, AppError> =>
  ResultAsync.fromPromise(fs.readFile(path, 'utf8'), (error) =>
    createAppError('FS_NOT_FOUND', `File not found: ${path}`),
  );
```

**Incorrect Usage:**

```ts
// Implicit any from loose typing
const processValue = (value: unknown) => {
  // value is implicitly any here
  return value.toString();
};

// Explicit any (should be Result<T, AppError> instead)
const riskyOperation = (): any => {
  return someExternalCall();
};
```
````
