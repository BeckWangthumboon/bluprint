import { execFile } from 'child_process';
import { mkdtemp, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const createTempDir = (prefix = 'bluprint-test-') => mkdtemp(path.join(tmpdir(), prefix));

export const initGitRepo = async (baseBranch = 'main'): Promise<string> => {
  const repoRoot = await createTempDir();

  await execFileAsync('git', ['init'], { cwd: repoRoot });
  await execFileAsync('git', ['config', 'user.email', 'tests@bluprint.local'], { cwd: repoRoot });
  await execFileAsync('git', ['config', 'user.name', 'Bluprint Tests'], { cwd: repoRoot });
  await execFileAsync('git', ['checkout', '-b', baseBranch], { cwd: repoRoot });

  await writeFile(path.join(repoRoot, '.gitignore'), '# temp repo\n', 'utf8');
  await execFileAsync('git', ['add', '.'], { cwd: repoRoot });
  await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: repoRoot });

  return repoRoot;
};

export const writeSpecFile = async (
  repoRoot: string,
  filename = 'feature.yaml',
  contents = '# Spec',
): Promise<string> => {
  const specPath = path.join(repoRoot, filename);
  await writeFile(specPath, contents, 'utf8');
  return specPath;
};

export const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const data = await readFile(filePath, 'utf8');
  return JSON.parse(data) as T;
};

export const runGit = async (repoRoot: string, args: string[]) =>
  execFileAsync('git', args, { cwd: repoRoot });
