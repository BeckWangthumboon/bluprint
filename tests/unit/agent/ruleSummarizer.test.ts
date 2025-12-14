import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ok, okAsync } from 'neverthrow';
import { ruleSummarizer } from '../../../src/agent/agents/ruleSummarizer.js';
import type { AgentRuntime } from '../../../src/agent/runtime/core.js';
import type { AppError } from '../../../src/types/errors.js';

vi.mock('../../../src/agent/runtime/index.js', () => ({
  createAgentRuntime: vi.fn(),
}));

const runtimeModule = await import('../../../src/agent/runtime/index.js');
const createAgentRuntimeMock = runtimeModule.createAgentRuntime as unknown as ReturnType<
  typeof vi.fn
>;

describe('ruleSummarizer.createModelSummarizer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a summarizer when runtime is available', async () => {
    const runtime: AgentRuntime = {
      generateText: () =>
        okAsync({
          text: '{"description":"desc","tags":["auth"]}',
          steps: [],
          usage: { inputTokens: 100, outputTokens: 50 },
        }),
      generateObject: (() => okAsync({ object: {}, usage: {} })) as any,
    };
    createAgentRuntimeMock.mockReturnValue(ok(runtime));

    const summarizerResult = ruleSummarizer.createModelSummarizer();

    expect(summarizerResult.isOk()).toBe(true);
    if (summarizerResult.isOk()) {
      const result = await summarizerResult.value({ path: 'rules/auth.md', content: '# auth' });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          description: 'desc',
          tags: ['auth'],
        });
      }
    }
  });

  it('returns error when runtime generateText yields invalid JSON', async () => {
    const runtime: AgentRuntime = {
      generateText: () =>
        okAsync({
          text: 'not-json',
          steps: [],
          usage: { inputTokens: 100, outputTokens: 50 },
        }),
      generateObject: (() => okAsync({ object: {}, usage: {} })) as any,
    };
    createAgentRuntimeMock.mockReturnValue(ok(runtime));

    const summarizerResult = ruleSummarizer.createModelSummarizer();

    expect(summarizerResult.isOk()).toBe(true);
    if (summarizerResult.isOk()) {
      const result = await summarizerResult.value({
        path: 'rules/broken.md',
        content: '# broken',
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        const error = result.error as AppError;
        expect(error.code).toBe('LLM_ERROR');
      }
    }
  });
});
