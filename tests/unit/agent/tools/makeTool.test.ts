import { describe, it, expect } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';
import { z } from 'zod';
import { createToolRegistry, makeTool } from '../../../../src/agent/tools/types.js';
import { formatToolError, type ToolError } from '../../../../src/agent/tools/errors.js';

describe('makeTool', () => {
  it('validates input and invokes handler', async () => {
    const tool = makeTool({
      name: 'echo',
      description: 'Echo tool',
      inputSchema: z.object({ value: z.string() }),
      outputSchema: z.string(),
      handler: (args) => okAsync(`echo:${args.value}`),
    });

    const result = await tool.call({ value: 'hello' });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe('echo:hello');
    }
  });

  it('returns INVALID_ARGS when validation fails', async () => {
    const tool = makeTool({
      name: 'validate',
      inputSchema: z.object({ value: z.string() }),
      handler: () => okAsync('ok'),
    });

    const result = await tool.call({}); // missing value

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('INVALID_ARGS');
      expect(result.error.message).toContain('validate');
    }
  });

  it('propagates handler errors', async () => {
    const toolError: ToolError = { code: 'INTERNAL', message: 'handler failed' };
    const tool = makeTool({
      name: 'failing',
      inputSchema: z.object({ value: z.string() }),
      handler: () => errAsync(toolError),
    });

    const result = await tool.call({ value: 'hi' });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual(toolError);
    }
  });
});

describe('formatToolError', () => {
  it('returns tool-provided message when available', () => {
    const formatted = formatToolError('sample', { code: 'IO_ERROR', message: 'disk full' });

    expect(formatted).toBe('disk full');
  });

  it('falls back to code-based message when message is absent', () => {
    const formatted = formatToolError('sample', { code: 'NOT_FOUND', message: '' });

    expect(formatted).toContain('NOT_FOUND');
    expect(formatted).toContain('sample');
  });
});

describe('createToolRegistry', () => {
  it('gets and picks tools by name', async () => {
    const toolA = makeTool({
      name: 'a',
      inputSchema: z.string(),
      handler: (value) => okAsync(`a:${value}`),
    });
    const toolB = makeTool({
      name: 'b',
      inputSchema: z.string(),
      handler: (value) => okAsync(`b:${value}`),
    });
    const registry = createToolRegistry([toolA, toolB]);

    expect(registry.getTool('a')).toBe(toolA);
    expect(registry.getTool('missing')).toBeUndefined();

    const picked = registry.pick(['a', 'missing', 'b']);
    expect(picked).toEqual([toolA, toolB]);

    const callResult = await registry.pick(['a'])[0]?.call('value');
    expect(callResult?.isOk()).toBe(true);
  });
});
