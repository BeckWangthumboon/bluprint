import type { ModelConfig } from '../config/index.js';

interface AgentCallData {
  agent: 'codingAgent' | 'masterAgent';
  iteration: number;
  planStep: number;
  model: ModelConfig;
  sessionId: string;
  startedAt: Date;
  endedAt: Date;
  response: string;
  error?: string;
  decision?: 'accept' | 'reject';
}

interface ManifestData {
  runId: string;
  startedAt: Date;
  endedAt?: Date;
  status: 'in_progress' | 'completed' | 'failed' | 'aborted';
  totalIterations: number;
  inputSizes: { spec: number; plan: number; summary: number };
  error?: string;
  iterations: Array<{
    iteration: number;
    planStep: number;
    decision?: 'accept' | 'reject';
    codingDurationMs?: number;
    masterDurationMs?: number;
    commit?: {
      hash: string;
      message: string;
    };
  }>;
}

export type { AgentCallData, ManifestData };
