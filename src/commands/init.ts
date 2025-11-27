import path from 'path';
import type { InitArgs } from '../types/commands.js';
import { fsUtils } from '../lib/fs.js';
import { gitUtils } from '../lib/git.js';
import { err, ok, ResultAsync } from 'neverthrow';
import { createAppError, type AppError } from '../types/errors.js';

/**
 * Init Flow
 *
 * 1. Validate inputs
 *    - Check spec file exists
 *    - Validate base ref exists
 *
 * 2. Create config directory
 *    - Ensure .bluprint/ exists
 *    - Write config.json with spec and base
 *    - Move spec.md file to .bluprint/spec.md
 *
 * 3. Validate feature spec
 *    - Load and parse the spec
 */
function init(argv: InitArgs): ResultAsync<void, AppError> {
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
        .gitFetchPrune()
        .andThen(() => gitUtils.ensureInsideGitRepo())
        .andThen((insideRepo) => {
          if (!insideRepo) {
            return err(
              createAppError('GIT_NOT_REPO', 'Not inside a git repository', {
                path: process.cwd(),
              }),
            );
          }
          return gitUtils.gitCheckBranchExists(base);
        })
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
    .andThen(() => {
      // Delete spec.md file and move to .bluprint directory
      return fsUtils.fsMove(specPath, path.resolve('.bluprint', 'spec.md'));
    })
    .andThen(() => {
      return ok(void 0); // TODO: validate spec file
    });
}

export { init };
