# Agent Layer

`src/agent` is the only place that touches language models. It resolves providers, builds runtimes, and ships sanitized outputs to callers so the library layer never needs to know how LLMs are wired.

## Responsibilities and Boundaries
- Runtime construction lives in `src/agent/runtime/*`; callers receive an `AgentRuntime` interface with a single `generateText` method.
- Provider/model selection and env handling are centralized in `src/agent/llm/registry.ts`.
- Agent helpers (currently the rule summarizer) sit in `src/agent/agents/*` and consume an injected runtime; they return `Result/ResultAsync<AppError>` and never throw.
- CLI commands pull helpers from this layer (`src/commands/rules.ts` uses the summarizer) so `src/lib/**` remains LLM-free.

## Runtime Resolution Flow
1) `createAgentRuntime` (`src/agent/runtime/index.ts`) delegates to `createAiSdkRuntime`, which wraps the AI SDK `generateText` call and surfaces `ResultAsync<string, AppError>`.
2) The runtime asks `llm/registry.ts` for a `LanguageModel`. The registry:
   - Reads `PROVIDER` (defaults to `openrouter`; supports `zai`).
   - Fetches the provider-specific API key (`OPENROUTER_API_KEY` or `ZAI_API_KEY`); missing keys produce `LLM_ERROR`.
   - Builds a provider registry and resolves the model ID for that provider (`openrouter:amazon/nova-2-lite-v1:free` or `zai:GLM-4.6`).
3) Runtime invocation options map directly to the AI SDK: `messages`, optional `temperature`, optional `maxTokens`. Tools are accepted for parity but unused today.
4) Errors from model resolution or SDK calls are converted into `AppError` objects; callers never handle raw exceptions.

## Agent Helpers
- `agents/ruleSummarizer.ts` exposes `createModelSummarizer`, which returns a function that turns a rule file into `{ description, tags }`.
- Prompt: system role demands JSON-only responses with a <=160 character description and 1–5 concise tags; user role includes the rule path and full content.
- Execution path:
  1) Acquire a runtime via `createAgentRuntime`; if unavailable, return the `AppError`.
  2) Call `runtime.generateText` with `temperature: 0.2`.
  3) Strip code fences if present, parse JSON, and validate shape. Descriptions are trimmed to 160 characters; tags must be non-empty strings. Validation failures return `LLM_ERROR`.
- Output feeds directly into `ruleNormalize.buildRuleReferences`, which writes `.bluprint/rules/index.json`.

## How Commands Use It
- `bluprint rules` (`src/commands/rules.ts`) loads config, discovers rule files, requests a model-backed summarizer from `ruleSummarizer`, then builds and persists rule references. Human-facing output is handled in the command layer; the agent layer only returns structured data or `AppError`.

## Extending the Layer
- Add new runtimes or providers by expanding `llm/registry.ts` and exposing a factory in `src/agent/runtime`. Keep models/env keys centralized there.
- Add new agent helpers beside `ruleSummarizer` and inject runtimes rather than importing the AI SDK directly. Provide validation for any model output before returning data.
