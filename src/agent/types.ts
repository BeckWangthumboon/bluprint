import type { AgentType } from '../config/schemas.js';

export type { AgentType };
export type MasterAgentOutput = { decision: 'accept' } | { decision: 'reject'; task: string };
