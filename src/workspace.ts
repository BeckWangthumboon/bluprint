import { join } from 'path';
import { ResultAsync } from 'neverthrow';
import { appendFile, clearFile, readFile, writeFile } from './fs.js';

const DUO_DIR = join(process.cwd(), '.duo');
const LOG_FILE = join(DUO_DIR, 'logs.md');
const TASK_FILE = join(DUO_DIR, 'task.md');
const REPORT_FILE = join(DUO_DIR, 'report.md');
const SPEC_FILE = join(DUO_DIR, 'spec.md');
const PLAN_FILE = join(DUO_DIR, 'plan.md');
const SUMMARY_FILE = join(DUO_DIR, 'summary.md');

const appendLog = (entry: string): ResultAsync<void, Error> => {
  const normalized = entry.endsWith('\n') ? entry : `${entry}\n`;
  return appendFile(LOG_FILE, normalized);
};

const clearLogs = (): ResultAsync<void, Error> => clearFile(LOG_FILE);

const writeTask = (content: string): ResultAsync<void, Error> => writeFile(TASK_FILE, content);

const writeReport = (content: string): ResultAsync<void, Error> => writeFile(REPORT_FILE, content);

const writePlan = (content: string): ResultAsync<void, Error> => writeFile(PLAN_FILE, content);

const readLogs = (): ResultAsync<string, Error> => readFile(LOG_FILE);

const readTask = (): ResultAsync<string, Error> => readFile(TASK_FILE);

const readReport = (): ResultAsync<string, Error> => readFile(REPORT_FILE);

const readSpec = (): ResultAsync<string, Error> => readFile(SPEC_FILE);

const readPlan = (): ResultAsync<string, Error> => readFile(PLAN_FILE);

const readSummary = (): ResultAsync<string, Error> => readFile(SUMMARY_FILE);

const writeSummary = (content: string): ResultAsync<void, Error> =>
  writeFile(SUMMARY_FILE, content);

const workspaceConstants = {
  DUO_DIR,
  LOG_FILE,
  TASK_FILE,
  REPORT_FILE,
  SPEC_FILE,
  PLAN_FILE,
  SUMMARY_FILE,
};

const workspace = {
  logs: {
    append: appendLog,
    clear: clearLogs,
    read: readLogs,
  },
  task: {
    write: writeTask,
    read: readTask,
  },
  report: {
    write: writeReport,
    read: readReport,
  },
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
};

export { workspace, workspaceConstants };
