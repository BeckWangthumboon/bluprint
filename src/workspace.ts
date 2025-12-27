import { join } from 'path';
import { ResultAsync } from 'neverthrow';
import { appendFile, clearFile, readFile, writeFile } from './fs.js';

const DUO_DIR = join(process.cwd(), '.duo');
const LOGS_DIR = join(DUO_DIR, 'logs');
const TASK_MD_FILE = join(DUO_DIR, 'task.md');
const REPORT_FILE = join(DUO_DIR, 'report.md');
const SPEC_FILE = join(DUO_DIR, 'spec.md');
const PLAN_FILE = join(DUO_DIR, 'plan.md');
const SUMMARY_FILE = join(DUO_DIR, 'summary.md');
const STATE_FILE = join(DUO_DIR, 'state.json');

const readTask = (): ResultAsync<string, Error> => readFile(TASK_MD_FILE);

const writeTask = (content: string): ResultAsync<void, Error> => writeFile(TASK_MD_FILE, content);

const writeReport = (content: string): ResultAsync<void, Error> => writeFile(REPORT_FILE, content);

const writePlan = (content: string): ResultAsync<void, Error> => writeFile(PLAN_FILE, content);

const readReport = (): ResultAsync<string, Error> => readFile(REPORT_FILE);

const readSpec = (): ResultAsync<string, Error> => readFile(SPEC_FILE);

const readPlan = (): ResultAsync<string, Error> => readFile(PLAN_FILE);

const readState = (): ResultAsync<string, Error> => readFile(STATE_FILE);

const writeState = (content: string): ResultAsync<void, Error> => writeFile(STATE_FILE, content);

const readSummary = (): ResultAsync<string, Error> => readFile(SUMMARY_FILE);

const writeSummary = (content: string): ResultAsync<void, Error> =>
  writeFile(SUMMARY_FILE, content);

const workspaceConstants = {
  DUO_DIR,
  LOGS_DIR,
  TASK_MD_FILE,
  REPORT_FILE,
  SPEC_FILE,
  PLAN_FILE,
  SUMMARY_FILE,
  STATE_FILE,
};

const workspace = {
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
  state: {
    read: readState,
    write: writeState,
  },
};

export { workspace, workspaceConstants };
