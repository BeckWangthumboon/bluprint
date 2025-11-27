import path from 'path';
import type { InitArgs } from '../types/commands.js';
import { fsUtils } from '../lib/fs.js';
import { gitUtils } from '../lib/git.js';
import { err, ok, ResultAsync } from 'neverthrow';

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
function init(argv: InitArgs): ResultAsync<void, Error> {
  const { spec, base } = argv;
  const specPath = path.resolve(spec);

  return fsUtils
    .fsCheckAccess(specPath)
    .andThen(() => fsUtils.fsStat(specPath))
    .andThen((stat) => {
      if (!stat.isFile()) {
        return err(new Error(`Spec file ${specPath} is not a file`));
      }
      return ok(void 0);
    })
    .andThen(() => {
      return gitUtils
        .gitFetchPrune()
        .andThen(() => gitUtils.ensureInsideGitRepo())
        .andThen(() => gitUtils.gitCheckBranchExists(base));
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
