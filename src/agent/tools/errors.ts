type ToolErrorCode = 'INVALID_ARGS' | 'NOT_FOUND' | 'IO_ERROR' | 'INTERNAL';

type ToolError = {
  code: ToolErrorCode;
  message: string;
  details?: unknown;
};

/**
 * Formats a tool error into a model-friendly string.
 *
 * @param toolName - Name of the tool that failed; used only when the tool did not supply a message.
 * @param error - ToolError emitted by the tool; message is preferred when present.
 * @returns String description for the model; never throws.
 */
const formatToolError = (toolName: string, error: ToolError): string => {
  if (error.message) {
    return error.message;
  }
  return `Tool "${toolName}" failed (${error.code}).`;
};

export type { ToolError, ToolErrorCode };
export { formatToolError };
