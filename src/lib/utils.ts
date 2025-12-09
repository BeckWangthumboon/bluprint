import { Result } from 'neverthrow';

/**
 * Type guard to check if a value is a plain object (Record).
 *
 * @param value - Value to check.
 * @returns True if value is a non-null object that is not an array.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Safe JSON.parse wrapper using neverthrow's Result type.
 * Converts JSON.parse exceptions into Result errors.
 *
 * @param raw - JSON string to parse.
 * @returns Result containing parsed value or Error.
 */
export const safeJsonParse = Result.fromThrowable(JSON.parse, (error) => error as Error);
