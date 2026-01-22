import { ResultAsync } from 'neverthrow';
import { telemetryIO, createTelemetryIO } from './io.js';
import type { AgentCallData, ManifestData } from './types.js';
import {
  toFrontmatter,
  formatDuration,
  formatMasterAgentResponse,
  formatCodingAgentResponse,
} from './utils.js';

type TelemetryIO = ReturnType<typeof createTelemetryIO>;

class RunTracker {
  private runId: string;
  private io: TelemetryIO;

  constructor(runId: string, io: TelemetryIO = telemetryIO) {
    this.runId = runId;
    this.io = io;
  }

  /**
   * Log an agent call to the agents directory
   */
  logAgentCall(data: AgentCallData): ResultAsync<void, Error> {
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
    const formattedResponse =
      data.agent === 'masterAgent'
        ? formatMasterAgentResponse(data.response)
        : formatCodingAgentResponse(data.response);

    const body = `
# ${agentTitle} - Iteration ${data.iteration} (Plan Step ${data.planStep})

## Response

${formattedResponse}
${data.error ? `\n## Error\n\n${data.error}` : ''}`;

    return this.io.writeAgentCallFile(this.runId, filename, frontmatter + body);
  }

  /**
   * Write or update the manifest file
   */
  writeManifest(data: ManifestData): ResultAsync<void, Error> {
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
      ? formatDuration(data.endedAt.getTime() - data.startedAt.getTime())
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

    return this.io.writeManifestFile(this.runId, content);
  }
}

let currentRunTracker: RunTracker | null = null;

/**
 * Initialize a new run tracker for the given run ID
 */
const initRunTracker = (runId: string): RunTracker => {
  currentRunTracker = new RunTracker(runId);
  return currentRunTracker;
};

/**
 * Get the current run tracker. Throws if not initialized.
 */
const getRunTracker = (): RunTracker => {
  if (!currentRunTracker) {
    throw new Error('RunTracker not initialized - call initRunTracker() first');
  }
  return currentRunTracker;
};

/**
 * Reset the current run tracker. Used for testing only.
 * @internal
 */
const resetRunTracker = (): void => {
  currentRunTracker = null;
};

export { RunTracker, initRunTracker, getRunTracker, resetRunTracker };
