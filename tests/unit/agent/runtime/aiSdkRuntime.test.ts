import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from 'neverthrow';
import { createAppError } from '../../../../src/types/errors.js';

const getModelMock = vi.fn();
const generateTextMock = vi.fn();

vi.mock('../../../../src/agent/llm/registry.js', () => ({
  getModel: getModelMock,
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

const { createAiSdkRuntime } = await import('../../../../src/agent/runtime/aiSdkRuntime.js');

describe('createAgentRuntime', () => {
  beforeEach(() => {
    getModelMock.mockReset();
    generateTextMock.mockReset();
  });

  it('returns a runtime when model resolution succeeds', async () => {
    getModelMock.mockReturnValue(ok({} as unknown as import('ai').LanguageModel));
    generateTextMock.mockResolvedValue({ text: 'hello' } as never);

    const runtimeResult = createAiSdkRuntime();

    expect(getModelMock).toHaveBeenCalledTimes(1);
    expect(runtimeResult.isOk()).toBe(true);
    if (runtimeResult.isOk()) {
      const result = await runtimeResult.value.generateText({ messages: [] });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('hello');
      }
      expect(generateTextMock).toHaveBeenCalled();
    }
  });

  it('returns an error when model resolution fails', () => {
    const appError = createAppError('LLM_ERROR', 'missing key');
    getModelMock.mockReturnValue(err(appError));

    const runtimeResult = createAiSdkRuntime();

    expect(getModelMock).toHaveBeenCalledTimes(1);
    expect(runtimeResult.isErr()).toBe(true);
    if (runtimeResult.isErr()) {
      expect(runtimeResult.error).toBe(appError);
    }
  });
});
