import { join } from 'path';
import { ResultAsync } from 'neverthrow';
import { readFile, writeFile, moveFile, removeFile } from './fs.js';

const BLUPRINT_DIR = join(process.cwd(), '.bluprint');
const RUNS_DIR = join(BLUPRINT_DIR, 'runs');
const CACHE_DIR = join(BLUPRINT_DIR, 'cache');

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

const readTask = (): ResultAsync<string, Error> => readFile(TASK_MD_FILE);
const writeTask = (content: string): ResultAsync<void, Error> => writeFile(TASK_MD_FILE, content);

const readReport = (): ResultAsync<string, Error> => readFile(REPORT_FILE);
const writeReport = (content: string): ResultAsync<void, Error> => writeFile(REPORT_FILE, content);

const readSpec = (): ResultAsync<string, Error> => readFile(SPEC_FILE);

const readPlan = (): ResultAsync<string, Error> => readFile(PLAN_FILE);
const writePlan = (content: string): ResultAsync<void, Error> => writeFile(PLAN_FILE, content);

const readSummary = (): ResultAsync<string, Error> => readFile(SUMMARY_FILE);
const writeSummary = (content: string): ResultAsync<void, Error> =>
  writeFile(SUMMARY_FILE, content);

const readState = (): ResultAsync<string, Error> => readFile(STATE_FILE);
const writeState = (content: string): ResultAsync<void, Error> => writeFile(STATE_FILE, content);

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
            const result = await removeFile(path);
            if (result.isErr()) {
              console.warn(
                `[archive] Failed to delete temporary file ${name}: ${result.error.message}`
              );
            }
          } else {
            const dest = join(runDir, name);
            const result = await moveFile(path, dest);
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
  config: {},
};

export { workspace, workspaceConstants, archiveCacheToRun };
