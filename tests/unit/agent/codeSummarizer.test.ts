import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ok, okAsync, err, errAsync } from 'neverthrow';
import { codeSummarizer } from '../../../src/agent/agents/codeSummarizer.js';
import type { AgentRuntime } from '../../../src/agent/runtime/types.js';
import type { AppError } from '../../../src/types/errors.js';

vi.mock('../../../src/agent/runtime/index.js', () => ({
  createAgentRuntime: vi.fn(),
}));

const runtimeModule = await import('../../../src/agent/runtime/index.js');
const createAgentRuntimeMock = runtimeModule.createAgentRuntime as unknown as ReturnType<
  typeof vi.fn
>;

describe('codeSummarizer.createModelSummarizer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a summarizer when runtime is available', async () => {
    const runtime: AgentRuntime = {
      generateText: () => okAsync('This file exports utility functions for string manipulation.'),
    };
    createAgentRuntimeMock.mockReturnValue(ok(runtime));

    const summarizerResult = codeSummarizer.createModelSummarizer();

    expect(summarizerResult.isOk()).toBe(true);
    if (summarizerResult.isOk()) {
      const result = await summarizerResult.value({
        path: 'src/utils.ts',
        content: 'export const trim = (s: string) => s.trim();',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('This file exports utility functions for string manipulation.');
      }
    }
  });

  it('returns error when runtime creation fails', () => {
    const error: AppError = {
      code: 'LLM_ERROR',
      message: 'Failed to create runtime',
    };
    createAgentRuntimeMock.mockReturnValue(err(error));

    const summarizerResult = codeSummarizer.createModelSummarizer();

    expect(summarizerResult.isErr()).toBe(true);
    if (summarizerResult.isErr()) {
      expect(summarizerResult.error.code).toBe('LLM_ERROR');
    }
  });

  it('propagates runtime generateText errors', async () => {
    const error: AppError = {
      code: 'LLM_ERROR',
      message: 'Model unavailable',
    };
    const runtime: AgentRuntime = {
      generateText: () => errAsync(error),
    };
    createAgentRuntimeMock.mockReturnValue(ok(runtime));

    const summarizerResult = codeSummarizer.createModelSummarizer();

    expect(summarizerResult.isOk()).toBe(true);
    if (summarizerResult.isOk()) {
      const result = await summarizerResult.value({
        path: 'src/test.ts',
        content: 'test',
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('LLM_ERROR');
      }
    }
  });
});
