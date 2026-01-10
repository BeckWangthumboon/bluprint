import { join } from 'path';
import { Result, ResultAsync, ok } from 'neverthrow';
import { fsUtils } from '../fs.js';
import { workspaceConstants } from '../workspace.js';
import type { ModelConfig } from '../config/index.js';
import type { Session, OpenCodeSDKSession } from './opencodesdk.js';

const { RUNS_DIR } = workspaceConstants;

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
  status: 'in_progress' | 'completed' | 'failed' | 'aborted';
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
    return value.toString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return value.name ? `[Function ${value.name}]` : '[Function]';
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

  return JSON.stringify(value) ?? 'null';
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

const isMasterAgentDecision = (
  value: unknown
): value is { decision: 'accept' | 'reject'; task?: string } => {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  const decision = record.decision;
  if (decision !== 'accept' && decision !== 'reject') {
    return false;
  }

  if (record.task === undefined) {
    return true;
  }

  return typeof record.task === 'string';
};

const formatMasterAgentResponse = (response: string): string => {
  const parsedJson = Result.fromThrowable(
    (): unknown => JSON.parse(response),
    () => new Error('Invalid JSON')
  )();

  if (parsedJson.isErr()) {
    return response;
  }

  if (!isMasterAgentDecision(parsedJson.value)) {
    return response;
  }

  const { decision, task } = parsedJson.value;
  let returnString = `Decision: ${decision}`;
  if (decision === 'reject' && task) {
    returnString += ` \n \n Task: ${task}`;
  }
  return returnString;
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
    this.runDir = join(RUNS_DIR, runId);
    this.agentsDir = join(this.runDir, 'agents');
    this.sessionsDir = join(this.runDir, 'sessions');
    this.debugLogPath = join(this.runDir, 'debug.log');
  }

  /**
   * Purge all existing logs
   */
  async purge(): Promise<void> {
    await fsUtils.removeDir(RUNS_DIR);
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
    fsUtils.appendFile(this.debugLogPath, JSON.stringify(entry) + '\n').mapErr(() => {});
  }

  /**
   * Log a full session object as JSON
   */
  async logSession(
    sessionId: string,
    sessionData: OpenCodeSDKSession,
    meta: { agent: string; iteration?: number }
  ): Promise<void> {
    const prefix = String(meta.iteration ?? 0).padStart(3, '0');
    const agentShort = meta.agent.replace('Agent', '');
    const filename = `${prefix}-${agentShort}-${sessionId}.json`;
    const filepath = join(this.sessionsDir, filename);
    await fsUtils.writeFile(filepath, JSON.stringify(sessionData, null, 2));
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

    await fsUtils.writeFile(join(this.agentsDir, filename), frontmatter + body);
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

    let statusLine: string;
    switch (data.status) {
      case 'completed':
        statusLine = `Completed ${data.totalIterations} iterations in ${duration}`;
        break;
      case 'failed':
        statusLine = `Failed after ${data.totalIterations} iterations (${duration})`;
        break;
      case 'aborted':
        statusLine = `Aborted after ${data.totalIterations} iterations (${duration})`;
        break;
      default:
        statusLine = `In progress - ${data.totalIterations} iterations so far`;
    }

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

    await fsUtils.writeFile(join(this.runDir, 'manifest.md'), content);
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
    throw new Error('Logger not initialized - call initLogger() first');
  }
  return currentLogger;
};

/**
 * Get a debug-only logger that returns a no-op if not initialized.
 * Safe to call before initLogger().
 */
const getDebugLogger = (): Pick<Logger, 'debug'> => currentLogger ?? noopLogger;

/**
 * Initialize a new logger
 */
const initLogger = (runId: string): Logger => {
  currentLogger = new Logger(runId);
  return currentLogger;
};

interface SessionMetaData {
  agent: string;
  iteration?: number;
}

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/**
 * Log session data before cleanup.
 * Fetches session data and messages, logs them, and handles errors gracefully.
 */
const logSessionData = (session: Session, meta: SessionMetaData): ResultAsync<void, Error> =>
  ResultAsync.combine([session.getData(), session.messages()])
    .andThen(([sessionData, messages]) => {
      const logger = currentLogger;
      if (!logger) {
        return ok(undefined);
      }
      return ResultAsync.fromThrowable(
        async () =>
          logger.logSession(session.id, { ...sessionData, messages } as OpenCodeSDKSession, meta),
        toError
      )();
    })
    .orElse((error) => {
      console.warn(`[logger] Failed to log session ${session.id}: ${error.message}`);
      return ok(undefined);
    });

export type { AgentCallData, ManifestData, SessionMetaData };
export { Logger, getLogger, getDebugLogger, initLogger, logSessionData, RUNS_DIR };
