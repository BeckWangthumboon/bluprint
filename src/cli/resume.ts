import type { LoopState } from '../state.js';

export interface ResumeOptions {
  interactive: boolean;
  from?: string;
}

export interface ResumableRun {
  runId: string;
  status: LoopState['status'];
  startedAt: string;
  title: string;
  branch: string;
  completedTasks: number;
  totalTasks: number;
  statePath: string;
  specPath: string;
}

export interface RunSelection {
  runId: string;
  title: string;
}

// eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-unused-vars
export async function handleResume(_options: ResumeOptions): Promise<void> {
  console.log('Resume not implemented yet');
}
