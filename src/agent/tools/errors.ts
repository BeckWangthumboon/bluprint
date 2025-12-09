import type { AppError, AppErrorCode } from '../../types/errors.js';

type ToolErrorCode = 'INVALID_ARGS' | 'NOT_FOUND' | 'IO_ERROR' | 'INTERNAL';

type ToolError = {
  code: ToolErrorCode;
  message: string;
  details?: unknown;
};

const IO_ERROR_CODES: AppErrorCode[] = [
  'FS_ERROR',
  'FS_NOT_FOUND',
  'CONFIG_NOT_FOUND',
  'CONFIG_PARSE_ERROR',
];

/**
 * Creates a structured ToolError for tool handlers and registry calls.
 *
 * @param code - Stable tool-level error code describing the failure category.
 * @param message - Human-readable description of what failed and why.
 * @param details - Optional contextual payload to aid debugging and reporting.
 * @returns ToolError object used by tools to represent failures without throwing.
 */
const createToolError = (code: ToolErrorCode, message: string, details?: unknown): ToolError => ({
  code,
  message,
  details,
});

/**
 * Maps an AppError into a ToolError so tool consumers receive consistent IO vs INTERNAL classifications.
 *
 * @param error - AppError produced by lib/workspace operations; IO codes are translated directly.
 * @returns ToolError with IO_ERROR for known IO codes or INTERNAL for unexpected failures.
 */
const mapAppErrorToToolError = (error: AppError): ToolError => {
  const code: ToolErrorCode = IO_ERROR_CODES.includes(error.code) ? 'IO_ERROR' : 'INTERNAL';
  return createToolError(code, error.message, error);
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
export { createToolError, formatToolError, mapAppErrorToToolError };
