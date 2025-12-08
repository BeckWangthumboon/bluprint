import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err, okAsync, errAsync } from 'neverthrow';
import { z } from 'zod';
import { createAppError } from '../../../../src/types/errors.js';
import type { Tool, ToolError } from '../../../../src/agent/tools/types.js';

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

  it('maps messages and tools into AI SDK generateText call', async () => {
    getModelMock.mockReturnValue(ok({} as unknown as import('ai').LanguageModel));
    const toolCallMock = vi.fn().mockImplementation((input: unknown) => okAsync(`called:${input}`));
    generateTextMock.mockImplementation(async (options) => {
      const tool = (
        options.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>
      ).sampleTool;
      if (!tool) {
        throw new Error('tool missing');
      }
      const executionResult = await tool.execute('value');
      return { text: String(executionResult) } as never;
    });

    const runtimeResult = createAiSdkRuntime();

    expect(runtimeResult.isOk()).toBe(true);
    if (runtimeResult.isOk()) {
      const result = await runtimeResult.value.generateText({
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'assistant', content: 'asst' },
          { role: 'user', content: 'usr' },
        ],
        tools: [
          {
            name: 'sampleTool',
            description: 'example',
            inputSchema: z.string(),
            outputSchema: z.string(),
            call: (args: unknown) => toolCallMock(args),
          },
        ],
      });

      expect(generateTextMock).toHaveBeenCalledTimes(1);
      const callArgs = generateTextMock.mock.calls[0]?.[0];
      expect(callArgs.messages).toEqual([
        { role: 'system', content: 'sys' },
        { role: 'assistant', content: 'asst' },
        { role: 'user', content: 'usr' },
      ]);

      expect(toolCallMock).toHaveBeenCalledWith('value');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('called:value');
      }
    }
  });

  it('formats tool errors into strings returned to the model', async () => {
    getModelMock.mockReturnValue(ok({} as unknown as import('ai').LanguageModel));
    const toolError: ToolError = { code: 'INTERNAL', message: 'boom' };
    generateTextMock.mockImplementation(async (options) => {
      const tool = (
        options.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>
      ).sampleTool;
      if (!tool) {
        throw new Error('tool missing');
      }
      const executionResult = await tool.execute('value');
      return { text: String(executionResult) } as never;
    });

    const runtimeResult = createAiSdkRuntime();

    expect(runtimeResult.isOk()).toBe(true);
    if (runtimeResult.isOk()) {
      const result = await runtimeResult.value.generateText({
        messages: [{ role: 'user', content: 'hey' }],
        tools: [
          {
            name: 'sampleTool',
            inputSchema: z.string(),
            call: (): ReturnType<Tool['call']> => errAsync(toolError),
          },
        ],
      });

      expect(generateTextMock).toHaveBeenCalledTimes(1);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('boom');
      }
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
