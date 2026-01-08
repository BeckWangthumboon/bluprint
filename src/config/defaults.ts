import type { LimitsConfig, TimeoutsConfig, GeneralConfig } from './schemas.js';

export const DEFAULT_LIMITS_CONFIG: LimitsConfig = {
  maxIterations: 50,
  maxTimeMinutes: 15,
};

export const DEFAULT_TIMEOUTS_CONFIG: TimeoutsConfig = {
  codingAgentMin: 5,
  masterAgentMin: 5,
  planAgentMin: 10,
  summarizerAgentMin: 5,
  commitAgentMin: 5,
};

export const DEFAULT_GENERAL_CONFIG: GeneralConfig = {
  limits: DEFAULT_LIMITS_CONFIG,
  timeouts: DEFAULT_TIMEOUTS_CONFIG,
};
