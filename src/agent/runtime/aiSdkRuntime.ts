import { ResultAsync, type Result } from 'neverthrow';
import {
  generateText,
  type LanguageModel,
  type ModelMessage,
  type Tool as AiSdkTool,
  type ToolSet,
} from 'ai';
import { getModel } from '../llm/registry.js';
import { createAppError, type AppError } from '../../types/errors.js';
import type { Tool } from '../tools/types.js';
import { formatToolError } from '../tools/errors.js';
import type { AgentRuntime, AgentMessage } from './types.js';

class AiSdkRuntime implements AgentRuntime {
  private readonly model: LanguageModel;

  constructor(model: LanguageModel) {
    this.model = model;
  }

  generateText(args: {
    messages: AgentMessage[];
    temperature?: number;
    maxTokens?: number;
    tools?: Tool[];
  }): ResultAsync<string, AppError> {
    const aiMessages = this.mapMessages(args.messages);
    const aiSdkTools = args.tools && args.tools.length > 0 ? this.mapTools(args.tools) : undefined;

    return ResultAsync.fromPromise(
      generateText({
        model: this.model,
        messages: aiMessages,
        temperature: args.temperature,
        maxOutputTokens: args.maxTokens,
        tools: aiSdkTools,
      }),
      (error) => this.toAppError(error, aiMessages),
    ).map((result) => result.text);
  }

  private mapMessages(messages: AgentMessage[]): ModelMessage[] {
    return messages.map((message) => {
      if (message.role === 'system') {
        return { role: 'system', content: message.content };
      }
      if (message.role === 'assistant') {
        return { role: 'assistant', content: message.content };
      }
      return { role: 'user', content: message.content };
    });
  }

  private mapTools(tools: Tool[]): ToolSet {
    return tools.reduce<Record<string, AiSdkTool>>((acc, tool) => {
      acc[tool.name] = {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        execute: (input) =>
          tool
            .call(input)
            .map((value) => value)
            .mapErr((error) => formatToolError(tool.name, error))
            .match(
              (value) => value,
              (formattedError) => formattedError,
            ),
      };
      return acc;
    }, {});
  }

  // TODO: move this to utils file
  private toAppError(error: unknown, messages: ModelMessage[]): AppError {
    if (this.isAppError(error)) {
      return error;
    }
    const message = error instanceof Error ? error.message : 'Unknown AI SDK error';
    return createAppError('LLM_ERROR', `AI SDK generateText failed: ${message}`, { messages });
  }

  private isAppError(error: unknown): error is AppError {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error &&
      typeof (error as { message: unknown }).message === 'string',
    );
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
