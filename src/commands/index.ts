import { ResultAsync, okAsync } from 'neverthrow';
import type { IndexArgs } from '../types/commands.js';
import type { SuccessInfo } from '../lib/exit.js';
import type { AppError } from '../types/errors.js';
import { configUtils } from '../lib/workspace/config.js';
import { codebaseIndexer } from '../lib/codebase/build.js';
import { workspaceCodebase } from '../lib/workspace/codebase.js';

/**
 * Generates a codebase index with LLM-powered file descriptions.
 *
 * Flow: Validates config exists, builds the index by discovering files and generating descriptions,
 * then either outputs to stdout (--json) or writes to the workspace codebase index file.
 *
 * @param args - CLI args containing optional json and directory flags.
 * @returns ResultAsync containing success info on index generation, or AppError when generation fails.
 * @throws Never throws. Errors flow via AppError in ResultAsync.
 */
const index = (args: IndexArgs): ResultAsync<SuccessInfo, AppError> =>
  configUtils.loadConfig().andThen(() =>
    codebaseIndexer
      .buildCodebaseIndex(args.directory)
      .andThen((codebaseIndex) => {
        if (args.json) {
          console.log(JSON.stringify(codebaseIndex, null, 2));
          return okAsync(codebaseIndex);
        }
        return workspaceCodebase.writeCodebaseIndex(codebaseIndex).map(() => codebaseIndex);
      })
      .map((codebaseIndex) => ({
        command: 'index',
        message: `Indexed ${codebaseIndex.files.length} file(s).`,
        details: args.json ? undefined : codebaseIndex.files.map((f) => f.path),
      })),
  );

export { index };
