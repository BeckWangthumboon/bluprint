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
 * Flow: Checks that the spec path exists and is a file.
 * Confirms the current directory is a git repo and the base branch exists.
 * Then scaffolds the `.bluprint` directory with configuration and the spec file.
 * Lastly, validates the spec file.
 *
 * @param argv - CLI args containing spec path and base branch; spec must be a file; base branch must exist.
 * @returns ResultAsync containing success info on configuration creation, or AppError when validation or git/fs operations fail.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
function init(argv: InitArgs): ResultAsync<SuccessInfo, AppError> {
  const { spec, base } = argv;
  const specPath = path.resolve(spec);

  return gitUtils.gitGetRepoRoot().andThen((repoRoot) => {
    const bluprintDir = path.join(repoRoot, '.bluprint');
    const finalSpecPath = path.join(bluprintDir, 'spec.yaml');
    const configPath = path.join(bluprintDir, 'config.json');

    return fsUtils
      .fsCheckAccess(specPath)
      .andThen(() => fsUtils.fsStat(specPath))
      .andThen((stat) => {
        if (!stat.isFile()) {
          return err(
            createAppError('FS_ERROR', `Spec file ${specPath} is not a file`, { specPath }),
          );
        }
        return ok(void 0);
      })
      .andThen(() => {
        return gitUtils
          .gitFetchPrune()
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
      .andThen(() => fsUtils.fsMkdir(bluprintDir))
      .andThen(() => {
        return fsUtils.fsWriteFile(
          configPath,
          JSON.stringify({ base, specPath: path.relative(repoRoot, finalSpecPath) }, null, 2),
        );
      })
      .andThen(() => fsUtils.fsMove(specPath, finalSpecPath))
      .andThen(() => ok(void 0)) // Placeholder: validate spec file
      .andThen(() => {
        const successInfo: SuccessInfo = {
          command: 'init',
          message: 'Bluprint configuration initialized successfully',
        };
        return ok(successInfo);
      });
  });
}

export { init };
