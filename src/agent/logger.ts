import { join } from 'path';
import { Result } from 'neverthrow';
import { writeFile, appendFile, removeDir } from '../fs.js';
import { workspaceConstants } from '../workspace.js';
import type { ModelConfig } from './types.js';
import type { Session as SDKSession } from '@opencode-ai/sdk';

const { LOGS_DIR } = workspaceConstants;

interface AgentCallData {
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

interface ManifestData {
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

/**
 * Combined logger for run logs and debug events
 */
const formatMasterAgentResponse = (response: string): string => {
  const parsedJson = Result.fromThrowable(
    () => JSON.parse(response),
    () => new Error('Invalid JSON')
  )();

  if (parsedJson.isErr()) {
    return response;
  } else {
    const { decision, task } = parsedJson.value;
    let returnString = `Decision: ${decision}`;
    if (decision === 'reject' && task) {
      returnString += ` \n \n Task: ${task}`;
    }
    return returnString;
  }
};

const formatCodingAgentResponse = (response: string): string => {
  return response;
};

class Logger {
  private runId: string;
  private runDir: string;
  private agentsDir: string;
  private sessionsDir: string;
  private debugLogPath: string;

  constructor(runId: string) {
    this.runId = runId;
    this.runDir = join(LOGS_DIR, runId);
    this.agentsDir = join(this.runDir, 'agents');
    this.sessionsDir = join(this.runDir, 'sessions');
    this.debugLogPath = join(this.runDir, 'debug.log');
  }

  /**
   * Purge all existing logs
   */
  async purge(): Promise<void> {
    await removeDir(LOGS_DIR);
  }

  /**
   * Log a debug event with optional data (fire and forget)
   */
  debug(event: string, data?: Record<string, unknown>): void {
    const entry = {
      ts: new Date().toISOString(),
      event,
      ...data,
    };
    appendFile(this.debugLogPath, JSON.stringify(entry) + '\n').mapErr(() => {});
  }

  /**
   * Log a full session object as JSON
   */
  async logSession(
    sessionId: string,
    sessionData: SDKSession,
    meta: { agent: string; iteration?: number }
  ): Promise<void> {
    const prefix = String(meta.iteration ?? 0).padStart(3, '0');
    const agentShort = meta.agent.replace('Agent', '');
    const filename = `${prefix}-${agentShort}-${sessionId}.json`;
    const filepath = join(this.sessionsDir, filename);
    await writeFile(filepath, JSON.stringify(sessionData, null, 2));
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

${data.agent === 'masterAgent' ? formatMasterAgentResponse(data.response) : formatCodingAgentResponse(data.response)}
${data.error ? `\n## Error\n\n${data.error}` : ''}`;

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

let currentLogger: Logger | null = null;

const noopLogger = { debug: () => {} } as Pick<Logger, 'debug'>;

/**
 * Get the current logger instance. Throws if not initialized.
 */
const getLogger = (): Logger => {
  if (!currentLogger) {
    throw new Error('Logger not initialized - call purgeAndInitLogger() first');
  }
  return currentLogger;
};

/**
 * Get a debug-only logger that returns a no-op if not initialized.
 * Safe to call before purgeAndInitLogger().
 */
const getDebugLogger = (): Pick<Logger, 'debug'> => currentLogger ?? noopLogger;

/**
 * Purge all logs and initialize a new logger
 */
const purgeAndInitLogger = async (runId: string): Promise<Logger> => {
  currentLogger = new Logger(runId);
  await currentLogger.purge();
  return currentLogger;
};

export type { AgentCallData, ManifestData };
export { Logger, getLogger, getDebugLogger, purgeAndInitLogger, LOGS_DIR };
