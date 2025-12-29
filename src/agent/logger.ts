import { join } from 'path';
import { writeFile, removeDir } from '../fs.js';
import { workspaceConstants } from '../workspace.js';
import type { ModelConfig } from './types.js';

const { LOGS_DIR } = workspaceConstants;

export interface AgentCallData {
  agent: 'codingAgent' | 'masterAgent';
  iteration: number;
  planStep: number;
  model: ModelConfig;
  sessionId: string;
  startedAt: Date;
  endedAt: Date;
  response: string;
  error?: string;
  decision?: 'accept' | 'reject';
}

export interface ManifestData {
  runId: string;
  startedAt: Date;
  endedAt?: Date;
  status: 'in_progress' | 'completed' | 'failed';
  totalIterations: number;
  inputSizes: { spec: number; plan: number; summary: number };
  error?: string;
  iterations: Array<{
    iteration: number;
    planStep: number;
    decision?: 'accept' | 'reject';
    codingDurationMs?: number;
    masterDurationMs?: number;
    commit?: {
      hash: string;
      message: string;
    };
  }>;
}

const serializeValue = (value: unknown, indent = 0): string => {
  const spaces = '  '.repeat(indent);

  if (value === null || value === undefined) {
    return 'null';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value
      .map(
        (item) =>
          `${spaces}- ${typeof item === 'object' ? '\n' + serializeValue(item, indent + 1) : item}`
      )
      .join('\n');
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => {
        if (typeof v === 'object' && v !== null && !(v instanceof Date)) {
          return `${spaces}${k}:\n${serializeValue(v, indent + 1)}`;
        }
        return `${spaces}${k}: ${serializeValue(v, indent)}`;
      })
      .join('\n');
  }

  return String(value);
};

const toFrontmatter = (data: Record<string, unknown>): string => {
  const lines = Object.entries(data).map(([key, value]) => {
    if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
      return `${key}:\n${serializeValue(value, 1)}`;
    }
    return `${key}: ${serializeValue(value)}`;
  });

  return `---\n${lines.join('\n')}\n---`;
};

class RunLogger {
  private runId: string;
  private runDir: string;
  private agentsDir: string;

  constructor(runId: string) {
    this.runId = runId;
    this.runDir = join(LOGS_DIR, runId);
    this.agentsDir = join(this.runDir, 'agents');
  }

  /**
   * Purge all existing logs
   */
  async purge(): Promise<void> {
    await removeDir(LOGS_DIR);
  }

  /**
   * Log an agent call
   */
  async logAgentCall(data: AgentCallData): Promise<void> {
    const durationMs = data.endedAt.getTime() - data.startedAt.getTime();
    const prefix = String(data.iteration).padStart(3, '0');
    const agentShort = data.agent.replace('Agent', '');
    const filename = `${prefix}-${agentShort}.md`;

    const frontmatterData: Record<string, unknown> = {
      agent: data.agent,
      iteration: data.iteration,
      planStep: data.planStep,
      model: data.model,
      sessionId: data.sessionId,
      startedAt: data.startedAt,
      endedAt: data.endedAt,
      durationMs,
    };

    if (data.error) {
      frontmatterData.error = data.error;
    }

    if (data.decision) {
      frontmatterData.decision = data.decision;
    }

    const frontmatter = toFrontmatter(frontmatterData);

    const agentTitle = data.agent === 'codingAgent' ? 'Coding Agent' : 'Master Agent';

    const body = `
# ${agentTitle} - Iteration ${data.iteration} (Plan Step ${data.planStep})

## Response

\`\`\`
${data.response}
\`\`\`
${data.error ? `\n## Error\n\n\`\`\`\n${data.error}\n\`\`\`` : ''}`;

    await writeFile(join(this.agentsDir, filename), frontmatter + body);
  }

  /**
   * Write or update the manifest file
   */
  async writeManifest(data: ManifestData): Promise<void> {
    const frontmatterData: Record<string, unknown> = {
      runId: data.runId,
      startedAt: data.startedAt,
      endedAt: data.endedAt || null,
      status: data.status,
      totalIterations: data.totalIterations,
      inputSizes: data.inputSizes,
    };

    if (data.error) {
      frontmatterData.error = data.error;
    }

    const frontmatter = toFrontmatter(frontmatterData);

    const duration = data.endedAt
      ? this.formatDuration(data.endedAt.getTime() - data.startedAt.getTime())
      : 'in progress';

    let iterationsSummary = '';
    if (data.iterations.length > 0) {
      iterationsSummary = data.iterations
        .map((iter) => {
          const parts = [`Iteration ${iter.iteration} (Step ${iter.planStep})`];
          if (iter.decision) parts.push(iter.decision);
          if (iter.codingDurationMs)
            parts.push(`coding: ${(iter.codingDurationMs / 1000).toFixed(1)}s`);
          if (iter.masterDurationMs)
            parts.push(`review: ${(iter.masterDurationMs / 1000).toFixed(1)}s`);
          if (iter.commit) parts.push(`commit: ${iter.commit.hash.slice(0, 7)}`);
          return `- ${parts.join(' | ')}`;
        })
        .join('\n');
    } else {
      iterationsSummary = '- No iterations completed';
    }

    const statusLine =
      data.status === 'completed'
        ? `Completed ${data.totalIterations} iterations in ${duration}`
        : data.status === 'failed'
          ? `Failed after ${data.totalIterations} iterations (${duration})`
          : `In progress - ${data.totalIterations} iterations so far`;

    const content = `${frontmatter}

# Run Summary

${statusLine}

## Input Sizes

- spec.md: ${data.inputSizes.spec} chars
- plan.md: ${data.inputSizes.plan} chars  
- summary.md: ${data.inputSizes.summary} chars

## Iterations

${iterationsSummary}
${data.error ? `\n## Error\n\n\`\`\`\n${data.error}\n\`\`\`` : ''}
`;

    await writeFile(join(this.runDir, 'manifest.md'), content);
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }
}

let currentLogger: RunLogger | null = null;

/**
 * Initialize the logger for a new run. Call this at the start of the loop.
 */
export const initLogger = (runId: string): RunLogger => {
  currentLogger = new RunLogger(runId);
  return currentLogger;
};

/**
 * Get the current logger instance. Throws if not initialized.
 */
export const getLogger = (): RunLogger => {
  if (!currentLogger) {
    throw new Error('Logger not initialized - call initLogger() first');
  }
  return currentLogger;
};

/**
 * Purge all logs and initialize a new logger.
 */
export const purgeAndInitLogger = async (runId: string): Promise<RunLogger> => {
  const logger = initLogger(runId);
  await logger.purge();
  return logger;
};

export { LOGS_DIR };
