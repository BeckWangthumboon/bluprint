import { createAiSdkRuntime } from './aiSdkRuntime.js';

/**
 * Resolves the default AgentRuntime implementation.
 *
 * @returns the default AgentRuntime implementation.
 */
const createAgentRuntime = createAiSdkRuntime;

export { createAgentRuntime };
