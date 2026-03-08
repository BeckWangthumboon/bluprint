import { join } from 'path';
import { ResultAsync } from 'neverthrow';
import { fsUtils } from './fs.js';

const BLUPRINT_DIR = join(process.cwd(), '.bluprint');
const RUNS_DIR = join(BLUPRINT_DIR, 'runs');
const CACHE_DIR = join(BLUPRINT_DIR, 'cache');

const getRunDir = (runId: string): string => join(RUNS_DIR, runId);

// Workspace files
const SPEC_FILE = join(CACHE_DIR, 'spec.md');
const PLAN_FILE = join(CACHE_DIR, 'plan.md');
const SUMMARY_FILE = join(CACHE_DIR, 'summary.md');
const STATE_FILE = join(CACHE_DIR, 'state.json');
const TASK_MD_FILE = join(CACHE_DIR, 'task.md');
const REPORT_FILE = join(CACHE_DIR, 'report.md');

const CACHE_FILES_TO_ARCHIVE = [
  { name: 'spec.md', path: SPEC_FILE },
  { name: 'plan.md', path: PLAN_FILE },
  { name: 'summary.md', path: SUMMARY_FILE },
  { name: 'state.json', path: STATE_FILE },
  { name: 'task.md', path: TASK_MD_FILE },
  { name: 'report.md', path: REPORT_FILE },
];

const TEMP_FILE_NAMES = new Set(['task.md', 'report.md']);

const readTask = (): ResultAsync<string, Error> => fsUtils.readFile(TASK_MD_FILE);
const writeTask = (content: string): ResultAsync<void, Error> =>
  fsUtils.writeFile(TASK_MD_FILE, content);

const readReport = (): ResultAsync<string, Error> => fsUtils.readFile(REPORT_FILE);
const writeReport = (content: string): ResultAsync<void, Error> =>
  fsUtils.writeFile(REPORT_FILE, content);

const readSpec = (): ResultAsync<string, Error> => fsUtils.readFile(SPEC_FILE);

const readPlan = (): ResultAsync<string, Error> => fsUtils.readFile(PLAN_FILE);
const writePlan = (content: string): ResultAsync<void, Error> =>
  fsUtils.writeFile(PLAN_FILE, content);

const readSummary = (): ResultAsync<string, Error> => fsUtils.readFile(SUMMARY_FILE);
const writeSummary = (content: string): ResultAsync<void, Error> =>
  fsUtils.writeFile(SUMMARY_FILE, content);

const readState = (): ResultAsync<string, Error> => fsUtils.readFile(STATE_FILE);
const writeState = (content: string): ResultAsync<void, Error> =>
  fsUtils.writeFile(STATE_FILE, content);

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

/**
 * Copy persisted run files into the cache directory for resuming.
 * @param runId - The run identifier to hydrate from
 * @returns A ResultAsync that resolves when the cache is hydrated
 */
const hydrateCacheFromRun = (runId: string): ResultAsync<void, Error> => {
  const runFiles = getRunFilePaths(runId);
  return ResultAsync.combine([
    fsUtils.copyFile(runFiles.spec, SPEC_FILE),
    fsUtils.copyFile(runFiles.plan, PLAN_FILE),
    fsUtils.copyFile(runFiles.summary, SUMMARY_FILE),
    fsUtils.copyFile(runFiles.state, STATE_FILE),
  ]).map(() => undefined);
};

/**
 * Archive cache files to the run directory.
 * Moves files from .bluprint/cache/ to .bluprint/runs/<runId>/
 *
 * @param runId - The run identifier
 * @param options - Optional configuration
 * @param options.deleteTemp - If true, deletes task.md and report.md
 *
 * Logs warnings for move/delete failures but does not throw.
 */
const archiveCacheToRun = (
  runId: string,
  options?: { deleteTemp?: boolean }
): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(
    (async () => {
      const runDir = join(RUNS_DIR, runId);
      const shouldDeleteTemp = options?.deleteTemp === true;
      const results = await Promise.allSettled(
        CACHE_FILES_TO_ARCHIVE.map(async ({ name, path }) => {
          if (shouldDeleteTemp && TEMP_FILE_NAMES.has(name)) {
            const result = await fsUtils.removeFile(path);
            if (result.isErr()) {
              console.warn(
                `[archive] Failed to delete temporary file ${name}: ${result.error.message}`
              );
            }
          } else {
            const dest = join(runDir, name);
            const result = await fsUtils.moveFile(path, dest);
            if (result.isErr()) {
              console.warn(
                `[archive] Failed to move ${name} to run ${runId}: ${result.error.message}`
              );
            }
          }
        })
      );

      const rejected = results.filter((r) => r.status === 'rejected');
      if (rejected.length > 0) {
        console.warn(`[archive] ${rejected.length} file(s) failed to archive`);
      }
    })(),
    (err) => (err instanceof Error ? err : new Error(String(err)))
  );

const workspaceConstants = {
  BLUPRINT_DIR,
  RUNS_DIR,
  CACHE_DIR,
  getRunDir,
  SPEC_FILE,
  PLAN_FILE,
  SUMMARY_FILE,
  STATE_FILE,
  TASK_MD_FILE,
  REPORT_FILE,
};

const workspace = {
  cache: {
    spec: {
      read: readSpec,
    },
    plan: {
      read: readPlan,
      write: writePlan,
    },
    summary: {
      read: readSummary,
      write: writeSummary,
    },
    state: {
      read: readState,
      write: writeState,
    },
    task: {
      read: readTask,
      write: writeTask,
    },
    report: {
      read: readReport,
      write: writeReport,
    },
  },
  run: {
    getFilePaths: getRunFilePaths,
    hydrateCache: hydrateCacheFromRun,
  },
  config: {},
};

export { workspace, workspaceConstants, archiveCacheToRun, hydrateCacheFromRun, getRunFilePaths };
