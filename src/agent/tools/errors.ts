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
const INVALID_ARG_CODES: AppErrorCode[] = ['VALIDATION_ERROR'];

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
 * Maps an AppError into a ToolError so tool consumers receive consistent IO, argument, or internal classifications.
 *
 * @param error - AppError produced by lib/workspace operations; IO codes map to IO_ERROR and validation maps to INVALID_ARGS.
 * @returns ToolError with IO_ERROR for known IO codes, INVALID_ARGS for validation issues, or INTERNAL for unexpected failures.
 */
const mapAppErrorToToolError = (error: AppError): ToolError => {
  if (IO_ERROR_CODES.includes(error.code)) {
    return createToolError('IO_ERROR', error.message, error);
  }
  if (INVALID_ARG_CODES.includes(error.code)) {
    return createToolError('INVALID_ARGS', error.message, error);
  }
  return createToolError('INTERNAL', error.message, error);
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
