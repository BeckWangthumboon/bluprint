import { ResultAsync } from 'neverthrow';
import type { AppError } from '../../types/errors.js';
import type { Tool } from '../tools/types.js';
import { z } from 'zod';

export type AgentRole = 'system' | 'user' | 'assistant';

export type AgentMessage = {
  role: AgentRole;
  content: string;
};

export type GenerateTextArgs = {
  messages: AgentMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: Tool[];
  maxSteps?: number;
  finishReason?: string;
};

export type GenerateTextReturn = {
  text: string;
  steps: RuntimeStep[];
  usage: RuntimeUsage;
};

export type GenerateObjectArgs<T> = {
  messages: AgentMessage[];
  schema: z.ZodType<T>;
  temperature?: number;
  maxTokens?: number;
  finishReason?: string;
};

export type GenerateObjectReturn<T> = {
  object: T;
  usage: RuntimeUsage;
};

export type RuntimeUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type RuntimeToolCall = {
  toolName: string;
  args: unknown;
};

export type RuntimeToolResult = {
  toolName: string;
  result: unknown;
};

export type RuntimeStep = {
  stepNumber: number;
  text?: string;
  finishReason?: string;
  usage?: RuntimeUsage;
  toolCalls?: RuntimeToolCall[];
  toolResults?: RuntimeToolResult[];
};

export interface AgentRuntime {
  /**
   * Generate text from messages with optional tools.
   *
   * @param args Configuration including messages, tools, and generation params
   * @returns ResultAsync containing generated text or AppError
   */
  generateText(args: GenerateTextArgs): ResultAsync<GenerateTextReturn, AppError>;

  /**
   * Generate a structured object from messages with optional tools.
   *
   * @param args Configuration including messages, schema, tools, and generation params
   * @returns ResultAsync containing the generated object with usage info or AppError
   */
  generateObject<T>(args: GenerateObjectArgs<T>): ResultAsync<GenerateObjectReturn<T>, AppError>;
}
