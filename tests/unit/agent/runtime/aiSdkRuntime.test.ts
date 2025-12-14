import { describe, it, expect, vi, beforeEach } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';
import { z } from 'zod';
import type { Tool, ToolError } from '../../../../src/agent/tools/types.js';

const generateTextMock = vi.fn();
const generateObjectMock = vi.fn();

vi.mock('ai', () => ({
  generateText: generateTextMock,
  generateObject: generateObjectMock,
  stepCountIs: vi.fn((n) => (step: any) => step.stepCount >= n),
}));

const { AiSdkRuntime } = await import('../../../../src/agent/runtime/aiSdk.js');

describe('AiSdkRuntime', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    generateObjectMock.mockReset();
  });

  it('returns GenerateTextReturn when generateText succeeds', async () => {
    const mockModel = {} as any;
    generateTextMock.mockResolvedValue({
      text: 'hello',
      steps: [],
      totalUsage: { inputTokens: 10, outputTokens: 5 },
    } as never);

    const runtime = new AiSdkRuntime(mockModel, {});

    const result = await runtime.generateText({ messages: [] });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.text).toBe('hello');
      expect(result.value.steps).toEqual([]);
      expect(result.value.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    }
    expect(generateTextMock).toHaveBeenCalled();
  });

  it('maps messages and tools into AI SDK generateText call', async () => {
    const mockModel = {} as any;
    const toolCallMock = vi.fn().mockImplementation((input: unknown) => okAsync(`called:${input}`));
    generateTextMock.mockImplementation(async (options) => {
      const tool = (options.tools as Record<string, { execute: (input: unknown) => Promise<any> }>)
        .sampleTool;
      if (!tool) {
        throw new Error('tool missing');
      }
      const result = await tool.execute('value');
      // Result from tool is a neverthrow Result, need to unwrap
      const value = result.isOk() ? result.value : result.error;
      return {
        text: String(value),
        steps: [],
        totalUsage: { inputTokens: 10, outputTokens: 5 },
      } as never;
    });

    const runtime = new AiSdkRuntime(mockModel, {});

    const result = await runtime.generateText({
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

    expect(toolCallMock).toHaveBeenCalledWith('value');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.text).toBe('called:value');
    }
  });

  it('formats tool errors into strings returned to the model', async () => {
    const mockModel = {} as any;
    const toolError: ToolError = { code: 'INTERNAL', message: 'boom' };
    generateTextMock.mockImplementation(async (options) => {
      const tool = (options.tools as Record<string, { execute: (input: unknown) => Promise<any> }>)
        .sampleTool;
      if (!tool) {
        throw new Error('tool missing');
      }
      const result = await tool.execute('value');
      // Result from tool is a neverthrow Result, need to unwrap the error
      const value = result.isErr() ? result.error : result.value;
      return {
        text: String(value),
        steps: [],
        totalUsage: { inputTokens: 10, outputTokens: 5 },
      } as never;
    });

    const runtime = new AiSdkRuntime(mockModel, {});

    const result = await runtime.generateText({
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
      expect(result.value.text).toBe('boom');
    }
  });
});
