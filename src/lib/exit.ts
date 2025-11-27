import type { AppError, AppErrorCode } from '../types/errors.js';

/**
 * Maps AppError codes to deterministic CLI exit codes.
 *
 * @param errorCode - Stable application error code.
 * @returns Numeric exit code aligned to user vs system vs git errors.
 */
const getExitCode = (errorCode: AppErrorCode): number => {
  switch (errorCode) {
    // User errors - exit code 1
    case 'FS_NOT_FOUND':
    case 'CONFIG_NOT_FOUND':
    case 'CONFIG_PARSE_ERROR':
    case 'VALIDATION_ERROR':
      return 1;

    // System errors - exit code 2
    case 'FS_ERROR':
    case 'GIT_ERROR':
    case 'GIT_COMMAND_FAILED':
    case 'LLM_ERROR':
      return 2;

    // Git repository errors - exit code 3
    case 'GIT_NOT_REPO':
      return 3;

    // Unknown errors - exit code 4
    case 'UNKNOWN':
    default:
      return 4;
  }
};

/**
 * Formats an AppError into user-facing CLI output with contextual hints.
 *
 * @param error - Application error including code and optional details payload.
 * @returns Multi-line string suitable for stderr presentation.
 */
const formatErrorMessage = (error: AppError): string => {
  const { code, message, details } = error;

  const lines: string[] = [`Error: ${message} (code: ${code})`];

  switch (code) {
    case 'FS_NOT_FOUND':
      lines.push('Hint: Verify the path exists and is readable.');
      break;
    case 'CONFIG_NOT_FOUND':
      lines.push('Hint: Run `bluprint init` to create a configuration.');
      break;
    case 'CONFIG_PARSE_ERROR':
      lines.push('Hint: Check your configuration file for syntax issues.');
      break;
    case 'GIT_NOT_REPO':
      lines.push('Hint: Run inside a git repository (`git init`), then retry.');
      break;
    case 'GIT_COMMAND_FAILED':
      lines.push('Hint: Ensure git is installed and accessible.');
      break;
    case 'FS_ERROR':
      lines.push('Hint: Check file permissions and available disk space.');
      break;
    case 'LLM_ERROR':
      lines.push('Hint: Confirm your API key and network connectivity.');
      break;
    case 'VALIDATION_ERROR':
      lines.push('Hint: Review the reported validation issues.');
      break;
    case 'GIT_ERROR':
    case 'UNKNOWN':
    default:
      lines.push('Hint: Retry with clean state or report this issue.');
      break;
  }

  if (details) {
    lines.push(`Details: ${JSON.stringify(details)}`);
  }

  return lines.join('\n');
};

/**
 * Writes a deterministic error message for CLI usage and sets exitCode.
 *
 * @param error - Application error to present; code determines exit status mapping.
 * @returns void; never throws; exitCode is updated in place.
 */
const displayError = (error: AppError): void => {
  console.error(formatErrorMessage(error));
  process.exitCode = getExitCode(error.code);
};

export interface SuccessInfo {
  command: string;
  message: string;
  details?: string[];
  nextSteps?: string[];
}

/**
 * Writes a concise success message for CLI usage.
 *
 * @param info - Structured success payload describing the completed command.
 * @returns void; never throws; exitCode remains unchanged.
 */
const displaySuccess = (info: SuccessInfo): void => {
  const { command, message } = info;
  console.log(`Success: ${message} (command: ${command})`);
};

export { displayError, displaySuccess };
