import { okAsync, ResultAsync } from 'neverthrow';
import { fsUtils } from '../fs.js';
import type { AppError } from '../../types/errors.js';
import type { CodeSummarizer } from '../../agent/agents/codeSummarizer.js';

/**
 * Generates an LLM-powered description for a single file.
 *
 * @param filePath - Repo-relative path to the file to describe.
 * @param summarizer - CodeSummarizer function to generate descriptions.
 * @returns ResultAsync containing the description; empty string on any error (never throws).
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const generateFileDescription = (
  filePath: string,
  summarizer: CodeSummarizer,
): ResultAsync<string, AppError> => {
  return fsUtils
    .fsReadFile(filePath)
    .andThen((fileContent) =>
      summarizer({
        path: filePath,
        content: fileContent,
      })
        .map((text) => text.slice(0, 2000))
        .orElse(() => okAsync('')),
    )
    .orElse(() => okAsync(''));
};

export const fileDescriber = {
  generateFileDescription,
};
