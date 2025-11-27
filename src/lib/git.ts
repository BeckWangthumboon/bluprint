import { spawn } from 'child_process';
import { err, ok, ResultAsync } from 'neverthrow';

interface GitRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

interface GitRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const gitRun = (args: string[], options?: GitRunOptions) =>
  ResultAsync.fromPromise<GitRunResult, Error>(
    new Promise((resolve, reject) => {
      const child = spawn('git', args, {
        cwd: options?.cwd ?? process.cwd(),
        env: { ...process.env, ...options?.env },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        reject(err);
      });

      child.on('close', (code) => {
        const exitCode = code ?? 0;
        if (exitCode === 0) {
          resolve({ stdout, stderr, exitCode });
        } else {
          reject(new Error(stderr || `git ${args.join(' ')} exited with code ${exitCode}`));
        }
      });
    }),
    (error) => new Error(`Git command failed (git ${args.join(' ')}): ${(error as Error).message}`),
  );

const gitFetchPrune = () => gitRun(['fetch', '--prune']);

const ensureInsideGitRepo = () =>
  gitRun(['rev-parse', '--is-inside-work-tree'])
    .andThen((result) => {
      const stdout = result.stdout;
      const inside = stdout.trim() === 'true';
      return inside ? ok(true) : err(new Error('Not inside a git worktree'));
    })
    .mapErr((e) => new Error(`Unable to check git worktree: ${e.message}`));

const gitCheckBranchExists = (branch: string) =>
  gitRun(['rev-parse', '--verify', '--quiet', branch])
    .map(() => true)
    .orElse((e) => {
      if (/exit(ed)? with code (1|128)/i.test(e.message)) return ok(false);
      return err(new Error(`Unable to check branch ${branch}: ${e.message}`));
    });

export const gitUtils = {
  gitFetchPrune,
  ensureInsideGitRepo,
  gitCheckBranchExists,
};
