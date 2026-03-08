import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ResultAsync } from 'neverthrow';
import { fsUtils } from '../../src/fs.js';
import { createTempDir } from './tempDir.js';

type CacheFileName = 'spec.md' | 'plan.md' | 'summary.md' | 'state.json' | 'task.md' | 'report.md';

type WorkspacePaths = {
  root: string;
  bluprintDir: string;
  cacheDir: string;
  runsDir: string;
  specFile: string;
  planFile: string;
  summaryFile: string;
  stateFile: string;
  taskFile: string;
  reportFile: string;
};

type WorkspaceFixture = {
  paths: WorkspacePaths;
  writeCacheFile: (name: CacheFileName, content: string) => Promise<void>;
  readCacheFile: (name: CacheFileName) => Promise<string>;
  reset: () => Promise<void>;
  cleanup: () => Promise<void>;
};

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

const buildPaths = (root: string): WorkspacePaths => {
  const bluprintDir = join(root, '.bluprint');
  const cacheDir = join(bluprintDir, 'cache');
  const runsDir = join(bluprintDir, 'runs');

  return {
    root,
    bluprintDir,
    cacheDir,
    runsDir,
    specFile: join(cacheDir, 'spec.md'),
    planFile: join(cacheDir, 'plan.md'),
    summaryFile: join(cacheDir, 'summary.md'),
    stateFile: join(cacheDir, 'state.json'),
    taskFile: join(cacheDir, 'task.md'),
    reportFile: join(cacheDir, 'report.md'),
  };
};

const cacheFilePath = (paths: WorkspacePaths, name: CacheFileName): string => {
  switch (name) {
    case 'spec.md':
      return paths.specFile;
    case 'plan.md':
      return paths.planFile;
    case 'summary.md':
      return paths.summaryFile;
    case 'state.json':
      return paths.stateFile;
    case 'task.md':
      return paths.taskFile;
    case 'report.md':
      return paths.reportFile;
  }
};

/**
 * Creates a temporary workspace fixture with cache helpers.
 *
 * @returns Workspace fixture with paths and cleanup/reset helpers.
 */
const createWorkspaceFixture = async (): Promise<WorkspaceFixture> => {
  const temp = await createTempDir();
  const paths = buildPaths(temp.path);

  const reset = async (): Promise<void> => {
    await rm(paths.bluprintDir, { recursive: true, force: true });
    await mkdir(paths.cacheDir, { recursive: true });
  };

  const writeCacheFile = async (name: CacheFileName, content: string): Promise<void> => {
    await mkdir(paths.cacheDir, { recursive: true });
    await writeFile(cacheFilePath(paths, name), content, 'utf8');
  };

  const readCacheFile = async (name: CacheFileName): Promise<string> => {
    return readFile(cacheFilePath(paths, name), 'utf8');
  };

  await reset();

  return {
    paths,
    writeCacheFile,
    readCacheFile,
    reset,
    cleanup: temp.cleanup,
  };
};

/**
 * Builds a workspace module stub for mocking.
 *
 * @param paths - Workspace paths for cache files.
 * @returns Module exports compatible with src/workspace.ts.
 */
const createWorkspaceModule = (paths: WorkspacePaths) => {
  const readFileResult = (filePath: string) => fsUtils.readFile(filePath);
  const writeFileResult = (filePath: string, content: string) =>
    fsUtils.writeFile(filePath, content);
  const getRunDir = (runId: string): string => join(paths.runsDir, runId);
  const getRunFilePaths = (runId: string) => {
    const runDir = getRunDir(runId);
    return {
      runDir,
      spec: join(runDir, 'spec.md'),
      plan: join(runDir, 'plan.md'),
      summary: join(runDir, 'summary.md'),
      state: join(runDir, 'state.json'),
      task: join(runDir, 'task.md'),
      report: join(runDir, 'report.md'),
    };
  };
  const hydrateCacheFromRun = (runId: string) => {
    const runFiles = getRunFilePaths(runId);
    return ResultAsync.combine([
      fsUtils.copyFile(runFiles.spec, paths.specFile),
      fsUtils.copyFile(runFiles.plan, paths.planFile),
      fsUtils.copyFile(runFiles.summary, paths.summaryFile),
      fsUtils.copyFile(runFiles.state, paths.stateFile),
    ]).map(() => undefined);
  };

  const workspace = {
    cache: {
      spec: {
        read: () => readFileResult(paths.specFile),
      },
      plan: {
        read: () => readFileResult(paths.planFile),
        write: (content: string) => writeFileResult(paths.planFile, content),
      },
      summary: {
        read: () => readFileResult(paths.summaryFile),
        write: (content: string) => writeFileResult(paths.summaryFile, content),
      },
      state: {
        read: () => readFileResult(paths.stateFile),
        write: (content: string) => writeFileResult(paths.stateFile, content),
      },
      task: {
        read: () => readFileResult(paths.taskFile),
        write: (content: string) => writeFileResult(paths.taskFile, content),
      },
      report: {
        read: () => readFileResult(paths.reportFile),
        write: (content: string) => writeFileResult(paths.reportFile, content),
      },
    },
    run: {
      getFilePaths: getRunFilePaths,
      hydrateCache: hydrateCacheFromRun,
    },
    config: {},
  };

  const archiveCacheToRun = () => ResultAsync.fromPromise(Promise.resolve(undefined), toError);

  const workspaceConstants = {
    BLUPRINT_DIR: paths.bluprintDir,
    RUNS_DIR: paths.runsDir,
    CACHE_DIR: paths.cacheDir,
    getRunDir,
    SPEC_FILE: paths.specFile,
    PLAN_FILE: paths.planFile,
    SUMMARY_FILE: paths.summaryFile,
    STATE_FILE: paths.stateFile,
    TASK_MD_FILE: paths.taskFile,
    REPORT_FILE: paths.reportFile,
  };

  return {
    workspace,
    archiveCacheToRun,
    workspaceConstants,
    getRunFilePaths,
    hydrateCacheFromRun,
  };
};

export type { WorkspaceFixture, WorkspacePaths };
export { createWorkspaceFixture, createWorkspaceModule };
