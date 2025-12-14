import { Result } from 'neverthrow';
import type { AgentRuntime } from './core.js';
import type { AppError } from '../../types/errors.js';
import { getModel } from '../llm/registry.js';
import { AiSdkRuntime, type Config } from './aiSdk.js';

/**
 * Creates an AgentRuntime backed by the AI SDK for text generation.
 *
 * @returns Result containing a ready runtime instance or AppError when model resolution fails. Never throws; errors flow via AppError in Result.
 */
const createAgentRuntime = (config: Config): Result<AgentRuntime, AppError> =>
  getModel().map((model) => new AiSdkRuntime(model, config));

export { createAgentRuntime };
