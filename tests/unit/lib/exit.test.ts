import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { displayError, displaySuccess } from '../../../src/lib/exit.js';
import type { AppError } from '../../../src/types/errors.js';

let originalExitCode: number | undefined;

beforeEach(() => {
  originalExitCode = process.exitCode;
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe('displayError', () => {
  it('sets exit code and formats user-facing errors', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error: AppError = { code: 'FS_NOT_FOUND', message: 'missing file' };

    displayError(error);

    expect(process.exitCode).toBe(1);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const message = consoleSpy.mock.calls[0]?.[0];
    expect(message).toContain('missing file');
    expect(message).toContain('Hint: Verify the path exists');
  });

  it('sets system exit code for system errors', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error: AppError = { code: 'GIT_ERROR', message: 'git failed' };

    displayError(error);

    expect(process.exitCode).toBe(2);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });
});

describe('displaySuccess', () => {
  it('prints a success message without changing exit code', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    displaySuccess({ command: 'init', message: 'done' });

    expect(consoleSpy).toHaveBeenCalledWith('Success: done (command: init)');
    expect(process.exitCode).toBe(originalExitCode);
  });
});
