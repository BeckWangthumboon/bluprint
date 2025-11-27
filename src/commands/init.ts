import path from 'path';
import type { InitArgs } from '../types/commands.js';
import { fsUtils } from '../lib/fs.js';
import { gitUtils } from '../lib/git.js';
import { err, ok, ResultAsync } from 'neverthrow';
import { createAppError, type AppError } from '../types/errors.js';
import type { SuccessInfo } from '../lib/exit.js';

/**
 * Creates the initial Bluprint configuration in the current git repository.
 *
 * @param argv - CLI args containing spec path and base branch; spec must be a file; base branch must exist.
 * @returns ResultAsync containing success info on configuration creation, or AppError when validation or git/fs operations fail. Never throws.
 * @throws Never throws. Errors are represented using AppError.
 */
function init(argv: InitArgs): ResultAsync<SuccessInfo, AppError> {
  const { spec, base } = argv;
  const specPath = path.resolve(spec);

  return fsUtils
    .fsCheckAccess(specPath)
    .andThen(() => fsUtils.fsStat(specPath))
    .andThen((stat) => {
      if (!stat.isFile()) {
        return err(createAppError('FS_ERROR', `Spec file ${specPath} is not a file`, { specPath }));
      }
      return ok(void 0);
    })
    .andThen(() => {
      return gitUtils
        .ensureInsideGitRepo()
        .andThen(() => gitUtils.gitFetchPrune())
        .andThen(() => gitUtils.gitCheckBranchExists(base))
        .andThen((branchExists) => {
          if (!branchExists) {
            return err(
              createAppError('GIT_ERROR', `Base branch '${base}' does not exist`, {
                branch: base,
              }),
            );
          }
          return ok(void 0);
        });
    })
    .andThen(() => {
      return fsUtils.fsMkdir(path.resolve('.bluprint'));
    })
    .andThen(() => {
      return fsUtils.fsWriteFile(
        path.resolve('.bluprint', 'config.json'),
        JSON.stringify({ base, specPath }, null, 2),
      );
    })
    .andThen(() => fsUtils.fsMove(specPath, path.resolve('.bluprint', 'spec.md')))
    .andThen(() => {
      const successInfo: SuccessInfo = {
        command: 'init',
        message: 'Bluprint configuration initialized successfully',
      };
      return ok(successInfo);
    });
}

export { init };
