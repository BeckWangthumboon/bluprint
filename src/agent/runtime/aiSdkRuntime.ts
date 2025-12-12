import { errAsync, ResultAsync, type Result } from 'neverthrow';
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
import type {
  AgentRuntime,
  AgentMessage,
  AgentStep,
  AgentToolCall,
  GenerateTextResult,
  GenerateObjectResult,
} from './types.js';

class AiSdkRuntime implements AgentRuntime {
  private readonly model: LanguageModel;

  constructor(model: LanguageModel) {
    this.model = model;
  }

  generateText(args: {
    messages: AgentMessage[];
    tools?: Tool[];
    temperature?: number;
    maxTokens?: number;
    stop?: { maxSteps?: number };
    onStepFinish?: (step: AgentStep) =>Promise<void> | void;
  }): ResultAsync<GenerateTextResult, AppError> {
    const aiMessages = this.mapMessages(args.messages);
    const aiSdkTools = args.tools && args.tools.length > 0 ? this.mapTools(args.tools) : undefined;

    // Track steps for our result
    const steps: AgentStep[] = [];

    return ResultAsync.fromPromise(
      (async (): Promise<GenerateTextResult> => {
        const result = await generateText({
          model: this.model,
          messages: aiMessages,
          temperature: args.temperature,
          maxOutputTokens: args.maxTokens,
          tools: aiSdkTools,
          // TODO: Add step limiting when AI SDK version supports it
          // Adapt each AI SDK step to our format and invoke callback
          onStepFinish: async (aiStep) => {
            const adaptedStep = this.adaptStep(aiStep, steps.length);
            steps.push(adaptedStep);
            await args.onStepFinish?.(adaptedStep);
          },
        });

        return {
          text: result.text,
          steps,
          finishReason: result.finishReason,
          usage: result.usage as
            | {
                promptTokens?: number;
                completionTokens?: number;
                totalTokens?: number;
              }
            | undefined,
        };
      })(),
      (error) => this.toAppError(error, aiMessages),
    );
  }

  generateObject<TObject>(args: {
    messages: AgentMessage[];
    schema: unknown;
    temperature?: number;
    maxTokens?: number;
  }): ResultAsync<GenerateObjectResult<TObject>, AppError> {
    // Stub for future implementation
    return errAsync(
      createAppError(
        'LLM_ERROR',
        'generateObject is not yet implemented. Use generateText with tools for now.',
      ),
    );
  }

  /**
   * Adapts an AI SDK step to our AgentStep format.
   */
  private adaptStep(aiStep: any, index: number): AgentStep {
    // Extract tool calls from the AI SDK step
    const toolCalls: AgentToolCall[] = [];

    if (aiStep.toolCalls && Array.isArray(aiStep.toolCalls)) {
      for (const call of aiStep.toolCalls) {
        toolCalls.push({
          id: call.toolCallId || String(toolCalls.length),
          name: call.toolName,
          args: call.args,
        });
      }
    }

    // Extract messages from the AI SDK step
    const messages: AgentMessage[] = [];
    if (aiStep.text) {
      messages.push({
        role: 'assistant',
        content: aiStep.text,
      });
    }

    return {
      index,
      messages,
      toolCalls,
      finishReason: aiStep.finishReason,
    };
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
