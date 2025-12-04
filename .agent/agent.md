# Bluprint Agent Rules

Applies to: `src/agent/**/*` (runtime factories, provider registry, agent helpers like summarizers).

---

## Hard Constraints

### 1) Centralize LLM Access Through AgentRuntime
- Only call models through an `AgentRuntime` produced by `createAgentRuntime`; never import `ai` SDK functions or providers directly in helpers or commands.

**Allowed (runtime boundary respected):**
```ts
// src/agent/agents/ruleSummarizer.ts
const createModelSummarizer = () =>
  createAgentRuntime().map(
    (runtime) => (input) =>
      runtime.generateText({ messages: buildMessages(input), temperature: 0.2 })
  );
```

**Forbidden (direct SDK usage in helpers/commands):**
```ts
// Incorrect: bypasses runtime factory
import { generateText } from 'ai';

const summarize = (content: string) =>
  generateText({ model: 'openrouter:...', messages: [{ role: 'user', content }] });
```

### 2) Single Provider/Model Registry
- Provider selection, API keys, and model IDs live only in `src/agent/llm/registry.ts`. Do not read `process.env` or hardcode model strings elsewhere.

**Allowed (registry owns env + model resolution):**
```ts
// src/agent/runtime/aiSdkRuntime.ts
const createAiSdkRuntime = () => getModel().map((model) => new AiSdkRuntime(model));
```

**Forbidden (env access in helpers):**
```ts
// Incorrect: helper reads env directly
const apiKey = process.env.OPENROUTER_API_KEY; // Not allowed outside registry
```

### 3) LLM-Free Library Layer
- `src/lib/**` must never import agent code or talk to models. Inject agent-provided functions into lib or commands instead.

**Allowed (in command layer):**
```ts
// src/commands/rules.ts
const summarizerResult = ruleSummarizer.createModelSummarizer();
return ruleNormalize.buildRuleReferences(sources, summarizerResult.value);
```

**Forbidden (lib pulling agent):**
```ts
// Incorrect: lib module importing agent helper
import { ruleSummarizer } from '../agent/agents/ruleSummarizer.js'; // No agent deps in lib
```

### 4) Defensive Model Output Parsing
- Normalize fenced JSON, parse safely, trim description length, and validate tags/description types before returning.

**Allowed (defensive parsing):**
```ts
// src/agent/agents/ruleSummarizer.ts
const unwrapCodeFence = (raw: string) => {
  const match = /^```[a-zA-Z]*\\s*([\\s\\S]*?)\\s*```$/m.exec(raw.trim());
  return match?.[1] ?? raw.trim();
};

const validateModelResponse = (raw: string, path: string) =>
  ok(unwrapCodeFence(raw))
    .andThen(parseJson)
    .andThen(validateShape(path)); // trims description, validates non-empty tags
```

**Forbidden (trusting raw output):**
```ts
// Incorrect: no fence stripping or validation
const summarize = (raw: string) => JSON.parse(raw); // Fails on ```json fenced output
```

### 5) Result-Based Error Handling Only
- All agent code returns `Result/ResultAsync<AppError>`; never throw or leak raw `Error`.

**Allowed:**
```ts
return ResultAsync.fromPromise(
  generateText(args),
  (error) => createAppError('LLM_ERROR', `AI SDK failed: ${(error as Error).message}`)
);
```

**Forbidden:**
```ts
// Incorrect: throwing inside agent helper
throw new Error('LLM unavailable');
```

---

## Soft Constraints

- **Deterministic prompts:** Prefer low temperatures (~0.2) and JSON-only prompts so model output is predictable across runs.
- **Stubbed tests:** Unit/integration tests should mock `createAgentRuntime` or summarizer functions; never call real providers.
- **Injectable runtimes:** Expose factories instead of singletons so callers/tests can swap runtimes without shared global state.

**Testing pattern (stub runtime):**
```ts
// tests/unit/agent/ruleSummarizer.test.ts
vi.mock('../../../src/agent/runtime/index.js', () => ({ createAgentRuntime: vi.fn() }));
createAgentRuntimeMock.mockReturnValue(ok({ generateText: () => okAsync('{"description":"d","tags":["t"]}') }));
```

---

## Process

1) **Add or change providers/models** – Update `MODEL_BY_PROVIDER` and `API_KEY_ENV_BY_PROVIDER` in `llm/registry.ts`; keep env access inside the registry; add tests that cover missing/invalid env and unavailable models.
2) **Create new agent helpers** – Place them in `src/agent/agents/*`; accept a runtime from `createAgentRuntime`; design a strict prompt/output contract; strip fences and validate the returned shape before exposing data.
3) **Wire commands to agents** – Validate CLI args in `src/commands/*`, then request agent helpers (e.g., summarizers) and pass them into lib functions. Do not let commands bypass the runtime factory.
4) **Testing** – For new helpers, cover: successful parsing, fenced JSON handling, invalid shape (missing tags/description), and runtime failures (`LLM_ERROR`, missing provider). Keep tests network-free by stubbing the runtime or registry.
