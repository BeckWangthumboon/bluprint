export type AppErrorCode =
  | 'FS_ERROR'
  | 'FS_NOT_FOUND'
  | 'CONFIG_NOT_FOUND'
  | 'CONFIG_PARSE_ERROR'
  | 'GIT_ERROR'
  | 'GIT_NOT_REPO'
  | 'GIT_COMMAND_FAILED'
  | 'LLM_ERROR'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export interface AppError {
  code: AppErrorCode;
  message: string;
  details?: unknown;
}

export const createAppError = (
  code: AppErrorCode,
  message: string,
  details?: unknown,
): AppError => ({
  code,
  message,
  details,
});
