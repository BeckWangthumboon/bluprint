import { ResultAsync } from 'neverthrow';
import { createAgentRuntime } from '../runtime/index.js';
import type { AppError } from '../../types/errors.js';

type CodeSummarizerInput = {
  path: string;
  content: string;
};

export type CodeSummarizer = (input: CodeSummarizerInput) => ResultAsync<string, AppError>;

/**
 * Generates a code summarizer that uses the configured language model.
 *
 * @returns Function that summarizes file path/content into a description; AppError on model failures. Never throws.
 */
const createModelSummarizer = () =>
  createAgentRuntime().map(
    (runtime) => (input: CodeSummarizerInput) =>
      runtime
        .generateText({
          messages: [
            {
              role: 'system',
              content:
                'Generate a brief 1-2 sentence summary (max 200 characters) of this code file. Focus on its primary purpose and key exports. Be concise and specific.',
            },
            {
              role: 'user',
              content: `File path: ${input.path}\n\nContent:\n${input.content}`,
            },
          ],
          temperature: 0.2,
        })
        .map((result) => result.text),
  );

export const codeSummarizer = {
  createModelSummarizer,
};
