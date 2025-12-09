import { fsUtils } from '../../lib/fs.js';
import { makeTool } from './types.js';
import { mapAppErrorToToolError, type ToolError } from './errors.js';
import { z } from 'zod';
import { type ResultAsync } from 'neverthrow';

type ViewFileResult = {
  path: string;
  contents: string;
};

/**
 * Normalizes a path within the repo and returns the file contents without throwing.
 *
 * @param path - File path to read; absolute or relative to the repo root.
 * @returns ResultAsync containing the repo-relative path and file contents; ToolError on validation or IO failure.
 */
const viewFile = (path: string): ResultAsync<ViewFileResult, ToolError> =>
  fsUtils
    .fsToRepoRelativePath(path)
    .mapErr(mapAppErrorToToolError)
    .andThen((repoRelativePath) =>
      fsUtils
        .fsReadFile(repoRelativePath)
        .mapErr(mapAppErrorToToolError)
        .map((contents) => ({ path: repoRelativePath, contents })),
    );

const viewFileTool = makeTool({
  name: 'viewFile',
  description: 'Read a file within the repository and return its contents.',
  inputSchema: z.object({
    path: z.string().min(1, 'path is required'),
  }),
  handler: ({ path }) => viewFile(path),
});

export { viewFileTool };
