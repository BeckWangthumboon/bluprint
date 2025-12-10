import { Result } from 'neverthrow';

/**
 * Type guard to check if a value is a plain object (Record).
 *
 * @param value - Value to check.
 * @returns True if value is a non-null object that is not an array.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Safe JSON.parse wrapper using neverthrow's Result type.
 * Converts JSON.parse exceptions into Result errors.
 *
 * @param raw - JSON string to parse.
 * @returns Result containing parsed value or Error.
 */
const safeJsonParse = Result.fromThrowable(JSON.parse, (error) => error as Error);

/**
 * Unwraps code fence from LLM response if present.
 * LLMs often wrap JSON responses in markdown code fences like ```json or ```typescript.
 * This function removes those fences if present, otherwise returns the trimmed input.
 *
 * @param raw - Raw string potentially containing code fences.
 * @returns Unwrapped string content.
 */
const unwrapCodeFence = (raw: string): string => {
  const trimmed = raw.trim();
  const fenceMatch = /^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/m.exec(trimmed);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1];
  }
  return trimmed;
};

export { isRecord, safeJsonParse, unwrapCodeFence };
