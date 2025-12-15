import { ResultAsync } from 'neverthrow';
import {
  generateText,
  generateObject,
  type LanguageModel,
  type ModelMessage,
  type Tool as AiSdkTool,
  type ToolSet,
  stepCountIs,
  type StepResult,
  type PrepareStepFunction,
} from 'ai';
import { createAppError, type AppError } from '../../types/errors.js';
import type { Tool } from '../tools/types.js';
import { formatToolError } from '../tools/errors.js';
import type {
  AgentRuntime,
  AgentMessage,
  GenerateObjectArgs,
  GenerateObjectReturn,
  GenerateTextArgs,
  GenerateTextReturn,
  PrepareStep,
  RuntimeStep,
} from './core.js';

class AiSdkRuntime implements AgentRuntime {
  private readonly model: LanguageModel;

  constructor(model: LanguageModel, _config: Config) {
    this.model = model;
  }

  generateText(args: GenerateTextArgs): ResultAsync<GenerateTextReturn, AppError> {
    const aiMessages = this.mapMessages(args.messages);
    const aiSdkTools = args.tools && args.tools.length > 0 ? this.mapTools(args.tools) : undefined;
    const prepareStep = args.prepareStep
      ? this.createPrepareStepAdapter(args.prepareStep)
      : undefined;

    return ResultAsync.fromPromise(
      generateText({
        model: this.model,
        messages: aiMessages,
        temperature: args.temperature,
        maxOutputTokens: args.maxTokens,
        tools: aiSdkTools,
        stopWhen: args.maxSteps ? stepCountIs(args.maxSteps) : undefined,
        prepareStep,
      }),
      (error) => this.toAppError(error, aiMessages),
    ).map((result) => ({
      text: result.text,
      steps: this.mapSteps(result.steps),
      usage: {
        inputTokens: result.totalUsage.inputTokens,
        outputTokens: result.totalUsage.outputTokens,
      },
    }));
  }

  generateObject<T>(args: GenerateObjectArgs<T>): ResultAsync<GenerateObjectReturn<T>, AppError> {
    const aiMessages = this.mapMessages(args.messages);
    return ResultAsync.fromPromise(
      (async () => {
        const res = await generateObject({
          model: this.model,
          messages: aiMessages,
          schema: args.schema,
          temperature: args.temperature,
          maxOutputTokens: args.maxTokens,
        });
        return {
          object: res.object as T,
          usage: {
            inputTokens: res.usage.inputTokens,
            outputTokens: res.usage.outputTokens,
          },
        };
      })(),
      (error) => this.toAppError(error, aiMessages),
    );
  }

  private mapMessages(messages: AgentMessage[]): ModelMessage[] {
    return messages.map((message) => {
      if (message.role === 'system') {
        return { role: 'system', content: message.content };
      }
      if (message.role === 'assistant') {
        return { role: 'assistant', content: message.content };
      }
      if (message.role === 'tool') {
        return { role: 'tool', content: message.content };
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
        execute: async (input) => {
          return await tool.call(input).mapErr((error) => formatToolError(tool.name, error));
        },
      };
      return acc;
    }, {});
  }

  private mapSteps(steps: StepResult<any>[]): RuntimeStep[] {
    return steps.map((step, index) => ({
      stepNumber: index + 1,
      text: step.text,
      finishReason: step.finishReason,
      usage: step.usage
        ? {
            inputTokens: step.usage.inputTokens,
            outputTokens: step.usage.outputTokens,
          }
        : undefined,
      toolCalls: step.toolCalls?.map((tc) => ({
        toolName: tc.toolName,
        args: tc.input,
      })),
      toolResults: step.toolResults?.map((tr) => ({
        toolName: tr.toolName,
        result: tr.output,
      })),
    }));
  }

  private mapModelMessagesToAgentMessages(messages: ModelMessage[]): AgentMessage[] {
    return messages.map((message) => {
      if (message.role === 'system') {
        return { role: 'system', content: message.content };
      }
      if (message.role === 'assistant') {
        return { role: 'assistant', content: message.content };
      }
      if (message.role === 'tool') {
        return { role: 'tool', content: message.content };
      }
      return { role: 'user', content: message.content };
    });
  }

  private createPrepareStepAdapter(
    prepareStep: PrepareStep,
  ): PrepareStepFunction<Record<string, AiSdkTool>> {
    return async ({ steps, stepNumber, messages }) => {
      const mappedSteps = this.mapSteps(steps);
      const mappedMessages = this.mapModelMessagesToAgentMessages(messages);
      const preparedStepSettings = await prepareStep({
        stepNumber,
        steps: mappedSteps,
        messages: mappedMessages,
      });

      if (!preparedStepSettings) {
        return undefined;
      }

      return {
        toolChoice: preparedStepSettings.toolChoice,
        activeTools: preparedStepSettings.activeTools,
        system: preparedStepSettings.system,
        messages: preparedStepSettings.messages
          ? this.mapMessages(preparedStepSettings.messages)
          : undefined,
      };
    };
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
      typeof (error as { code: unknown }).code === 'string' &&
      typeof (error as { message: unknown }).message === 'string',
    );
  }
}

type Config = {};

export { AiSdkRuntime, type Config };
