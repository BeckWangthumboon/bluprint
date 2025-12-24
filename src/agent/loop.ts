import { ResultAsync } from 'neverthrow';
import { workspace } from '../workspace.js';

export const saveReport = (report: string): ResultAsync<void, Error> =>
  workspace.report.write(report).mapErr((e) => new Error(`Error saving report: ${e.message}`));

export const saveTaskMarkdown = (task: string): ResultAsync<void, Error> =>
  workspace.task.write(task).mapErr((e) => new Error(`Error saving task: ${e.message}`));
