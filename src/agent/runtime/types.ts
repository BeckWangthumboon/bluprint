import { ResultAsync } from 'neverthrow';
import type { AppError } from '../../types/errors.js';

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
    tools?: string[];
  }): ResultAsync<string, AppError>;
}
