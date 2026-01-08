import type { LimitsConfig, TimeoutsConfig, GeneralConfig } from './schemas.js';

export const DEFAULT_LIMITS_CONFIG: LimitsConfig = {
  maxIterations: 50,
  maxTimeMinutes: 15,
};

export const DEFAULT_TIMEOUTS_CONFIG: TimeoutsConfig = {
  codingAgentMs: 300000,
  masterAgentMs: 300000,
  planAgentMs: 600000,
  summarizerAgentMs: 300000,
  commitAgentMs: 300000,
};

export const DEFAULT_GENERAL_CONFIG: GeneralConfig = {
  limits: DEFAULT_LIMITS_CONFIG,
  timeouts: DEFAULT_TIMEOUTS_CONFIG,
};
