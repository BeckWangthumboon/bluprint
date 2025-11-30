export type AppErrorCode =
  | 'FS_ERROR'
  | 'FS_NOT_FOUND'
  | 'CONFIG_NOT_FOUND'
  | 'CONFIG_PARSE_ERROR'
  | 'GIT_ERROR'
  | 'GIT_NOT_REPO'
  | 'GIT_COMMAND_FAILED'
  | 'SHELL_ERROR'
  | 'LLM_ERROR'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export interface AppError {
  code: AppErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Creates a structured AppError for Result/ResultAsync flows.
 *
 * @param code - Stable application error code describing the failure category.
 * @param message - Human-readable, actionable description of the error.
 * @param details - Optional contextual payload to aid debugging and reporting.
 * @returns AppError object used by callers to represent failures without throwing.
 */
export const createAppError = (
  code: AppErrorCode,
  message: string,
  details?: unknown,
): AppError => ({
  code,
  message,
  details,
});
