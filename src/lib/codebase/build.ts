import { errAsync, ResultAsync } from 'neverthrow';
import type { CodebaseIndex, CodebaseFileEntry } from '../../types/codebase.js';
import { fileDiscovery } from './discover.js';
import { fileDescriber } from './describe.js';
import { codeSummarizer } from '../../agent/agents/codeSummarizer.js';
import { createAppError } from '../../types/errors.js';
import type { AppError } from '../../types/errors.js';

/**
 * Builds a complete codebase index with LLM-generated file descriptions.
 *
 * @param targetDir - Optional directory to limit indexing scope; defaults to entire repo.
 * @returns ResultAsync containing CodebaseIndex with timestamp and file descriptions.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const buildCodebaseIndex = (targetDir?: string): ResultAsync<CodebaseIndex, AppError> => {
  const summarizerResult = codeSummarizer.createModelSummarizer();
  if (summarizerResult.isErr()) return errAsync(summarizerResult.error);

  const summarizer = summarizerResult.value;

  return fileDiscovery.discoverFiles(targetDir).andThen((filePaths) => {
    const processFilesSequentially = async (): Promise<CodebaseFileEntry[]> => {
      const entries: CodebaseFileEntry[] = [];

      for (const filePath of filePaths) {
        const descriptionResult = await fileDescriber.generateFileDescription(filePath, summarizer);

        if (descriptionResult.isErr()) {
          entries.push({
            path: filePath,
            description: '',
          });
        } else {
          entries.push({
            path: filePath,
            description: descriptionResult.value,
          });
        }

        // Optional delay between LLM calls to avoid rate limits
        // await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      return entries;
    };

    return ResultAsync.fromPromise(processFilesSequentially(), (error) =>
      createAppError('LLM_ERROR', `Failed to build codebase index: ${(error as Error).message}`),
    ).map((files) => ({
      generatedAt: new Date().toISOString(),
      files,
    }));
  });
};

export const codebaseIndexer = {
  buildCodebaseIndex,
};
