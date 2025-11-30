# Feature Specification

Minimum required sections for a valid spec:

- `overview.summary`
- Either `constraints` or `implementation_patterns.guidelines`
- `acceptance_criteria`
- `scope`

## 1. Overview

A brief description of the feature or change.

Describe:

- What is being built or modified
- The goal of the change
- The expected outcome for the user or system

Goals are optional; include them when they sharpen intent.

Data shape (TypeScript):

```ts
type Overview = {
  summary: string;
  goals?: string[];
};
```

---

## 2. Motivation (Why This Exists)

Explain why this work is needed.

Include:

- The problem or gap this solves
- Relevant context (tech debt, product needs, architectural reasons)
- What "success" looks like for this iteration

This section is optional; omit if context is already obvious.

Data shape (TypeScript):

```ts
type Motivation = {
  problem?: string;
  context?: string[];
};
```

---

## 3. Constraints (For This Flow Only)

Rules and limitations that apply **specifically to this feature’s implementation**.

Examples:

- Must not change the public API of existing modules
- Must reuse the existing logging/error/validation pattern
- Performance requirements (e.g., <100ms latency)
- Must avoid altering database schema in this iteration
- Must use existing abstractions (cache, event bus, etc.)

These guide the agent’s implementation decisions.

Include this or the Guidelines section (at least one of them must be present).

Data shape (TypeScript):

```ts
type Constraints = string[];
```

---

## 4. Implementation Patterns

Use **either or both** depending on the project stage.

### 4.1 Guidelines (If no existing patterns)

Describe the intended pattern or architectural approach for this feature.

Examples:

- “Authentication uses session + refresh tokens.”
- “All errors follow `{ code, message, details }` shape.”
- “API handlers must be pure functions with dependency injection.”

Include guidelines if `constraints` are absent; otherwise they’re optional.

Data shape (TypeScript):

```ts
type Guidelines = string[];
```

### 4.2 Examples (If patterns already exist)

Include small, focused examples extracted from the codebase.

Examples:

- Existing API route
- Existing validation object
- Existing error handling
- A typical service method

Data shape (TypeScript):

```ts
type ImplementationExample = {
  description: string;
  path: string;
};

type ImplementationPatterns = {
  guidelines?: Guidelines;
  examples?: ImplementationExample[];
};
```

These help the agent match the project’s existing style.

---

## 5. Acceptance Criteria

Explicit conditions the master agent uses to determine if the work is complete.

Examples:

- Feature works end-to-end with correct behavior
- New logic follows existing code patterns
- All relevant tests pass
- New tests cover success, validation, and error cases
- Logging/metrics follow the established format
- Documentation or comments updated if necessary

Required; define a concrete “done” state (aim for at least 3–4 bullets).

Data shape (TypeScript):

```ts
type AcceptanceCriteria = string[];
```

---

## 6. Edge Cases

Important edge cases the implementation must handle.

Examples:

- Missing fields
- Invalid inputs
- External service outages
- Partial failure handling
- Permission/authorization failures (if applicable)

Optional but recommended whenever failure modes are known.

Data shape (TypeScript):

```ts
type EdgeCase = {
  name: string;
  result: string;
  handling: string;
};

type EdgeCases = EdgeCase[];
```

---

## 7. Scope

Describes directories and files that are likely to be affected

For example:

- `src/api/users/**` for users folder in api
- `src/lib/user.ts` for user helpers

Can also describe areas that the agent should not affect

For example:

- `src/router/**` router in frontend
- `scripts/deploy/**` deploy scripts

Required; keep at least one include to bound the change surface. Exclude is optional—add only when there are explicit no-touch areas.

Data shape (TypeScript):

```ts
type Scope = {
  include: string[];
  exclude?: string[];
};
```

## 8. Rules

Point to external agent rule systems so the master agent can use them.

Examples:

- See CLAUDE.md for general agent instructions
- See .cursor/rules/ for Cursor-specific behavior
- See AGENTS.md if present
- See docs/architecture.md for broader system context

Optional; include when external rule sets apply.

Data shape (TypeScript):

```ts
type RuleReference = {
  name: string;
  path: string;
};

type Rules = RuleReference[];
```

---

## Example Structures

### YAML

```yaml
# Feature Specification for "Workspace sync status"
overview:
  summary: >
    Introduce a lightweight sync status indicator in the CLI so builders can
    immediately see whether local specs or rules are outdated compared to the
    remote source of truth, deciding whether to proceed, fetch updates, or pause
    changes without digging through logs.
  goals:
    - Reduce agent runs on stale specs or rule sets.
    - Make it obvious when a manual sync is required before continuing work.
motivation:
  problem: >
    Agents sometimes evaluate branches against outdated specs, leading to
    false negatives and wasted review cycles.
  context:
    - Remote specs are updated weekly; local copies often lag behind.
    - CI currently checks versions but does not show a clear local indicator.
constraints:
  - Must not modify how remote fetching/auth works; status is read-only.
  - Avoid new network calls during normal commands; rely on existing metadata.
  - Keep output quiet by default; only show status when explicitly requested.
  - Reuse the existing error and logging helpers; no direct fs or git calls.
implementation_patterns:
  guidelines:
    - Compute status from version metadata already stored on disk.
    - If metadata is missing, emit "unknown" with an actionable hint to sync.
    - Surface status in `bluprint init --show-status` and `bluprint status`.
  examples:
    - description: Existing CLI pattern for reporting derived state.
      path: src/commands/status.ts
    - description: Established error shape for user-facing messages.
      path: .agents/
acceptance_criteria:
  - Status command reports one of: in_sync, stale, or unknown.
  - Output follows existing CLI formatting for info messages.
  - Unit coverage for in-sync, stale, and missing-metadata scenarios.
  - No changes to current sync behavior beyond status reporting.
edge_cases:
  - name: missing_metadata
    result: unknown
    handling: Prompt user to run `bluprint sync` before continuing.
  - name: unreadable_metadata_file
    result: unknown
    handling: Log a single warning and continue without throwing.
  - name: inconsistent_versions
    result: stale
    handling: Suggest rerunning sync; do not attempt auto-repair.
scope:
  include:
    - src/commands/status.ts
    - src/lib/specs/**
  exclude:
    - network-fetch code paths
    - CLI argument parsing in unrelated commands
rules:
  - name: Bluprint Agent Rules
    path: .agents/
  - name: AGENTS overview
    path: AGENTS.md
```

### JSON/TypeScript

```ts
{
  overview: {
    summary:
      'Introduce a lightweight sync status indicator in the CLI so builders can immediately see whether local specs or rules are outdated compared to the remote source of truth, deciding whether to proceed, fetch updates, or pause changes without digging through logs.',
    goals: [
      'Reduce agent runs on stale specs or rule sets.',
      'Make it obvious when a manual sync is required before continuing work.',
    ],
  },
  motivation: {
    problem:
      'Agents sometimes evaluate branches against outdated specs, leading to false negatives and wasted review cycles.',
    context: [
      'Remote specs are updated weekly; local copies often lag behind.',
      'CI currently checks versions but does not show a clear local indicator.',
    ],
  },
  constraints: [
    'Must not modify how remote fetching/auth works; status is read-only.',
    'Avoid new network calls during normal commands; rely on existing metadata.',
    'Keep output quiet by default; only show status when explicitly requested.',
    'Reuse the existing error and logging helpers; no direct fs or git calls.',
  ],
  implementation_patterns: {
    guidelines: [
      'Compute status from version metadata already stored on disk.',
      'If metadata is missing, emit "unknown" with an actionable hint to sync.',
      'Surface status in `bluprint init --show-status` and `bluprint status`.',
    ],
    examples: [
      {
        description: 'Existing CLI pattern for reporting derived state.',
        path: 'src/commands/status.ts',
      },
      {
        description: 'Established error shape for user-facing messages.',
        path: '.agents/',
      },
    ],
  },
  acceptance_criteria: [
    'Status command reports one of: in_sync, stale, or unknown.',
    'Output follows existing CLI formatting for info messages.',
    'Unit coverage for in-sync, stale, and missing-metadata scenarios.',
    'No changes to current sync behavior beyond status reporting.',
  ],
  edge_cases: [
    {
      name: 'missing_metadata',
      result: 'unknown',
      handling: 'Prompt user to run `bluprint sync` before continuing.',
    },
    {
      name: 'unreadable_metadata_file',
      result: 'unknown',
      handling: 'Log a single warning and continue without throwing.',
    },
    {
      name: 'inconsistent_versions',
      result: 'stale',
      handling: 'Suggest rerunning sync; do not attempt auto-repair.',
    },
  ],
  scope: {
    include: ['src/commands/status.ts', 'src/lib/specs/**'],
    exclude: ['network-fetch code paths', 'CLI argument parsing in unrelated commands'],
  },
  rules: [
    {
      name: 'Bluprint Agent Rules',
      path: '.agents/',
    },
    {
      name: 'AGENTS overview',
      path: 'AGENTS.md',
    },
  ],
};
```

### Minimal Valid Spec (YAML)

```yaml
overview:
  summary: Short statement of the change and user impact.
constraints:
  - Guardrail or requirement that must not be broken.
acceptance_criteria:
  - Observable outcome that proves the change is complete.
scope:
  include:
    - src/path/to/touch/**
```
