import { ResultAsync } from 'neverthrow';
import type { AppError } from '../../types/errors.js';
import type { Tool } from '../tools/types.js';

export type AgentRole = 'system' | 'user' | 'assistant';

export type AgentMessage = {
  role: AgentRole;
  content: string;
};

/**
 * Represents a tool call made by the model during execution.
 */
export type AgentToolCall = {
  id: string;
  name: string;
  args: unknown;
};

/**
 * Represents a single step in multi-turn agent execution.
 * Each step contains the messages generated and any tool calls made.
 */
export type AgentStep = {
  index: number;
  messages: AgentMessage[];
  toolCalls: AgentToolCall[];
  finishReason?: string;
};

/**
 * Conditions for stopping agent execution.
 */
export type StopCondition = {
  /** Maximum number of steps the agent is allowed to take. */
  maxSteps?: number;
};

/**
 * Callback invoked after each step completes.
 * Use this to monitor progress, detect specific tool calls, or collect results.
 */
export type OnStepFinish = (step: AgentStep) => Promise<void> | void;

/**
 * Result from generateText with full execution details.
 */
export type GenerateTextResult = {
  /** Final text response from the model. */
  text: string;
  /** All steps taken during execution. */
  steps: AgentStep[];
  /** Why execution stopped ('stop', 'length', 'tool-calls', etc). */
  finishReason?: string;
  /** Token usage information. */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

/**
 * Result from generateObject with structured output.
 */
export type GenerateObjectResult<TObject> = {
  /** Structured object output. */
  object: TObject;
  /** Why generation stopped. */
  finishReason?: string;
  /** Token usage information. */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export interface AgentRuntime {
  /**
   * Generate text with optional tools and step engine.
   * Supports multi-turn tool calling with step-by-step control.
   */
  generateText(args: {
    messages: AgentMessage[];
    tools?: Tool[];
    temperature?: number;
    maxTokens?: number;
    /** Stop conditions (e.g., maxSteps). */
    stop?: StopCondition;
    /** Callback invoked after each step for monitoring/detection. */
    onStepFinish?: OnStepFinish;
  }): ResultAsync<GenerateTextResult, AppError>;

  /**
   * Generate structured output using a schema.
   * Used for single-call structured tasks without tool use.
   */
  generateObject<TObject>(args: {
    messages: AgentMessage[];
    /** Runtime-specific schema (Zod, JSON Schema, etc). */
    schema: unknown;
    temperature?: number;
    maxTokens?: number;
  }): ResultAsync<GenerateObjectResult<TObject>, AppError>;
}
