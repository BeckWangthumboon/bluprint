import { ResultAsync } from 'neverthrow';
import type { AppError } from '../../types/errors.js';
import type { Tool } from '../tools/types.js';

export type AgentRole = 'system' | 'user' | 'assistant';

export type AgentMessage = {
  role: AgentRole;
  content: string;
};

export interface AgentRuntime {
  generateText(args: {
    messages: AgentMessage[];
    temperature?: number;
    maxTokens?: number;
    tools?: Tool[];
  }): ResultAsync<string, AppError>;
}
