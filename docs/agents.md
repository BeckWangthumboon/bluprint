# Agent Layer

`src/agent` is the only place that touches language models. It resolves providers, builds runtimes, and ships sanitized outputs to callers so the library layer never needs to know how LLMs are wired.

## Responsibilities and Boundaries

- Runtime construction lives in `src/agent/runtime/*`; callers receive an `AgentRuntime` interface with a single `generateText` method.
- Provider/model selection and env handling are centralized in `src/agent/llm/registry.ts`.
- Agent helpers (currently the rule summarizer) sit in `src/agent/agents/*` and consume an injected runtime; they return `Result/ResultAsync<AppError>` and never throw.
- CLI commands pull helpers from this layer (`src/commands/rules.ts` uses the summarizer) so `src/lib/**` remains LLM-free.

## Runtime Resolution Flow

1. `createAgentRuntime` (`src/agent/runtime/index.ts`) delegates to `createAiSdkRuntime`, which wraps the AI SDK `generateText` call and surfaces `ResultAsync<string, AppError>`. It maps `AgentMessage` to SDK messages and, when provided, maps `Tool` definitions into the AI SDK tool shape so the model can call them.
2. The runtime asks `llm/registry.ts` for a `LanguageModel`. The registry:
   - Reads `PROVIDER` (defaults to `openrouter`; supports `zai`, `vertex`).
   - For `openrouter` and `zai`: fetches the provider-specific API key (`OPENROUTER_API_KEY` or `ZAI_API_KEY`); missing keys produce `LLM_ERROR`.
   - For `vertex`: uses Google Cloud Application Default Credentials (ADC) for authentication:
     - **Required**: `GOOGLE_APPLICATION_CREDENTIALS` — Path to a service account JSON key file (e.g., `./google-cloud-creds.json`)
     - Note: The credentials file should be git-ignored to prevent committing secrets.
   - Builds a provider registry and resolves the model ID for that provider.
3. Runtime invocation options map directly to the AI SDK: `messages`, optional `temperature`, optional `maxTokens`, and optional `tools`.
4. Tool errors are formatted via `agent/tools/errors.ts` to return model-friendly strings; SDK failures are converted into `AppError` objects. Callers never handle raw exceptions.

## Agent Helpers

- `agents/ruleSummarizer.ts` exposes `createModelSummarizer`, which returns a function that turns a rule file into `{ description, tags }`.
- Prompt: system role demands JSON-only responses with a <=160 character description and 1–5 concise tags; user role includes the rule path and full content.
- Execution path:
  1. Acquire a runtime via `createAgentRuntime`; if unavailable, return the `AppError`.
  2. Call `runtime.generateText` with `temperature: 0.2`.
  3. Strip code fences if present, parse JSON, and validate shape. Descriptions are trimmed to 160 characters; tags must be non-empty strings. Validation failures return `LLM_ERROR`.
- Output feeds directly into `ruleNormalize.buildRuleReferences`, which writes `.bluprint/rules/index.json`.

- `agents/planAgent.ts` exposes `createPlanAgent`, which returns a function that breaks down a specification into an actionable plan with tasks.
- Prompt: system role instructs the model to generate tasks in JSON format with IDs, titles, instructions, assigned rules, and optional scope/criteria/dependencies; user role provides the specification and rules index.
- Execution path:
  1. Acquire a runtime via `createAgentRuntime`; if unavailable, return the `AppError`.
  2. Call `runtime.generateText` with `temperature: 0.3` and tools (`lookupRules`, `viewFile`) for context gathering.
  3. Strip code fences if present, parse JSON, and validate the plan structure. Each task must have at least one rule assigned. Validation failures return `LLM_ERROR`.
- Output is written to `.bluprint/state/plan.json` via `workspacePlan.writePlan`.

## Tools

- Tool definitions live in `src/agent/tools/types.ts` as typed `Tool` contracts and are adapted to the AI SDK in `aiSdkRuntime`.
- `makeTool` wraps a handler with Zod validation; invalid args return `INVALID_ARGS` `ToolError` with `treeifyError` details.
- Tool errors are formatted for the model via `src/agent/tools/errors.ts`; successful outputs flow back to the model unchanged.
- Tool adoption is optional: pass `tools` into `AgentRuntime.generateText`; when present, the runtime exposes them to the model for tool-calling workflows.
- `createToolRegistry` (`src/agent/tools/types.ts`) builds a name-based registry so callers can pick subsets (e.g., `registry.pick(['foo', 'bar'])`) without manually assembling arrays.

## How Commands Use It

- `bluprint rules` (`src/commands/rules.ts`) loads config, discovers rule files, requests a model-backed summarizer from `ruleSummarizer`, then builds and persists rule references. Human-facing output is handled in the command layer; the agent layer only returns structured data or `AppError`.
- `bluprint plan` (`src/commands/plan.ts`) loads config, workspace spec, and rules index, then requests a plan agent from `planAgent` to generate actionable tasks from the specification. The plan is written to the workspace and task titles are displayed to the user.

## Extending the Layer

- Add new runtimes or providers by expanding `llm/registry.ts` and exposing a factory in `src/agent/runtime`. Keep models/env keys centralized there.
- Add new agent helpers beside `ruleSummarizer` and inject runtimes rather than importing the AI SDK directly. Provide validation for any model output before returning data.
