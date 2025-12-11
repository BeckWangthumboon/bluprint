import path from 'path';
import { errAsync, ResultAsync } from 'neverthrow';
import { fsUtils } from '../fs.js';
import { gitUtils } from '../git.js';
import { createAppError, type AppError } from '../../types/errors.js';

/**
 * Discovers all files within the workspace or a specific directory, respecting gitignore rules.
 *
 * @param targetDir - Optional directory to limit file discovery; defaults to entire repo.
 * @returns ResultAsync containing deduplicated repo-relative file paths; AppError when targetDir is invalid.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const discoverFiles = (targetDir?: string): ResultAsync<string[], AppError> => {
  return gitUtils.gitGetRepoRoot().andThen((repoRoot) => {
    const scanRoot = targetDir ?? repoRoot;

    return fsUtils.fsToRepoRelativePath(scanRoot).andThen((normalizedDir) =>
      fsUtils.fsStat(normalizedDir).andThen((stat) => {
        if (!stat.isDirectory()) {
          return errAsync(
            createAppError('VALIDATION_ERROR', `Target path '${targetDir}' is not a directory`, {
              targetDir,
            }),
          );
        }

        return fsUtils.fsListFilesRecursive(normalizedDir).map((files) => {
          const relativeFiles = files.map((file) => path.relative(repoRoot, file));
          const seen = new Set<string>();
          const deduped: string[] = [];

          relativeFiles.forEach((file) => {
            if (seen.has(file)) return;
            seen.add(file);
            deduped.push(file);
          });

          return deduped;
        });
      }),
    );
  });
};

export const fileDiscovery = {
  discoverFiles,
};
