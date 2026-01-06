import type { ModelConfig, AgentType } from '../config/schemas.js';

export type { ModelConfig, AgentType };
export type MasterAgentOutput = { decision: 'accept' } | { decision: 'reject'; task: string };
