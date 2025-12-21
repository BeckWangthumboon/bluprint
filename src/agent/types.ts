export interface ModelConfig {
  providerID: string;
  modelID: string;
}

export interface MasterAgentOutput {
  decision: 'accept' | 'reject';
  task: string;
}
