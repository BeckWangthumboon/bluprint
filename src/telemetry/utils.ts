import { Result } from 'neverthrow';

/**
 * Serialize a value to a YAML-like string for frontmatter.
 * @param value - The value to serialize
 * @param indent - The current indentation level (default 0)
 * @returns The serialized string representation
 */
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

/**
 * Convert a data object to YAML frontmatter format.
 * @param data - The data object to convert
 * @returns The frontmatter string wrapped in --- delimiters
 */
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
 * Format duration in human-readable form.
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "500ms", "1.5s", "2m 30s")
 */
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
};

/**
 * Type guard for master agent decision JSON.
 * @param value - The value to check
 * @returns True if value is a valid master agent decision object
 */
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

/**
 * Format master agent response for display in logs.
 * @param response - The raw response string from the master agent
 * @returns Formatted string showing decision and optional task
 */
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

/**
 * Format coding agent response for display in logs.
 * @param response - The raw response string from the coding agent
 * @returns Formatted response string
 */
const formatCodingAgentResponse = (response: string): string => {
  return response;
};

export {
  serializeValue,
  toFrontmatter,
  formatDuration,
  isMasterAgentDecision,
  formatMasterAgentResponse,
  formatCodingAgentResponse,
};
