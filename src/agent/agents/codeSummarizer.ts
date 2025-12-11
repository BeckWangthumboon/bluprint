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
      runtime.generateText({
        messages: [
          {
            role: 'system',
            content:
              'Analyze the source code file and provide a concise summary paragraph highlighting its key exports, responsibilities, and purpose. Focus on what the code does and what it provides to other parts of the system. Be specific about exported functions, classes, or constants.',
          },
          {
            role: 'user',
            content: `File path: ${input.path}\n\nContent:\n${input.content}`,
          },
        ],
        temperature: 0.2,
      }),
  );

export const codeSummarizer = {
  createModelSummarizer,
};
