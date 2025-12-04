import { ResultAsync, type Result } from 'neverthrow';
import { generateText, type LanguageModel } from 'ai';
import type { AgentRuntime, AgentMessage } from './types.js';
import { getModel } from '../llm/registry.js';
import { createAppError, type AppError } from '../../types/errors.js';

class AiSdkRuntime implements AgentRuntime {
  private readonly model: LanguageModel;

  constructor(model: LanguageModel) {
    this.model = model;
  }

  generateText(args: {
    messages: AgentMessage[];
    temperature?: number;
    maxTokens?: number;
    tools?: string[];
  }): ResultAsync<string, AppError> {
    return ResultAsync.fromPromise(
      generateText({
        model: this.model,
        messages: args.messages,
        temperature: args.temperature,
        maxOutputTokens: args.maxTokens,
      }),
      (error) =>
        createAppError('LLM_ERROR', `AI SDK generateText failed: ${(error as Error).message}`, {
          messages: args.messages,
        }),
    ).map((result) => result.text);
  }
}

/**
 * Creates an AgentRuntime backed by the AI SDK for text generation.
 *
 * @returns Result containing a ready runtime instance or AppError when model resolution fails. Never throws; errors flow via AppError in Result.
 */
const createAiSdkRuntime = (): Result<AgentRuntime, AppError> =>
  getModel().map((model) => new AiSdkRuntime(model));

export { createAiSdkRuntime };
