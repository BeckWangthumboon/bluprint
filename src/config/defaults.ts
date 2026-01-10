import type {
  LimitsConfig,
  TimeoutsConfig,
  GeneralConfig,
  GraphiteConfig,
  BluprintConfig,
} from './schemas.js';

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

export const DEFAULT_GRAPHITE_CONFIG: GraphiteConfig = {
  enabled: false,
};

export const DEFAULT_GENERAL_CONFIG: GeneralConfig = {
  limits: DEFAULT_LIMITS_CONFIG,
  timeouts: DEFAULT_TIMEOUTS_CONFIG,
  specFile: 'spec.md',
  graphite: DEFAULT_GRAPHITE_CONFIG,
};

export const DEFAULT_BLUPRINT_CONFIG: BluprintConfig = {
  ...DEFAULT_GENERAL_CONFIG,
  defaultPreset: undefined,
};
