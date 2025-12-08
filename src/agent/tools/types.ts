import type { ResultAsync } from 'neverthrow';
import { errAsync } from 'neverthrow';
import { type ZodType, z } from 'zod';

type ToolErrorCode = 'INVALID_ARGS' | 'NOT_FOUND' | 'IO_ERROR' | 'INTERNAL';

type ToolError = {
  code: ToolErrorCode;
  message: string;
  details?: unknown;
};

type Tool<TArgs = unknown, TResult = unknown> = {
  name: string;
  description?: string;
  inputSchema: ZodType<TArgs>;
  outputSchema?: ZodType<TResult>;
  call: (args: unknown) => ResultAsync<TResult, ToolError>;
};

interface ToolRegistry {
  getTool(name: string): Tool | undefined;
  pick(names: string[]): Tool[];
}

/**
 * Creates a Tool wrapper that validates inputs with Zod before invoking a handler.
 *
 * @param config - Name, description, schemas, and handler to wrap; input schema defines accepted args shape.
 * @returns Tool definition whose call method returns ResultAsync with ToolError on validation or handler failures.
 */
function makeTool<TArgs, TResult>(config: {
  name: string;
  description?: string;
  inputSchema: ZodType<TArgs>;
  outputSchema?: ZodType<TResult>;
  handler: (args: TArgs) => ResultAsync<TResult, ToolError>;
}): Tool<TArgs, TResult> {
  const { name, description, inputSchema, outputSchema, handler } = config;

  return {
    name,
    description,
    inputSchema,
    outputSchema,
    call(args: unknown) {
      const parsed = inputSchema.safeParse(args);
      if (!parsed.success) {
        const schemaType = inputSchema.def.type ?? 'schema';
        const issueSummary =
          parsed.error.issues.map((issue) => issue.message).join('; ') ||
          'Invalid arguments received.';
        return errAsync({
          code: 'INVALID_ARGS',
          message: `Invalid arguments for tool "${name}". Expected ${schemaType}. Issues: ${issueSummary}`,
          details: z.treeifyError(parsed.error),
        });
      }
      return handler(parsed.data);
    },
  };
}

export type { Tool, ToolRegistry, ToolError, ToolErrorCode };
export { makeTool };
