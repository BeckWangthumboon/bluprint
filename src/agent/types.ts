export interface ModelConfig {
  providerID: string;
  modelID: string;
}

export type MasterAgentOutput = { decision: 'accept' } | { decision: 'reject'; task: string };
