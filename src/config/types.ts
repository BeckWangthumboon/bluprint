import type { AgentType, ModelConfig } from './schemas.js';

export type ConfigValidationError =
  | { type: 'CONFIG_FILE_MISSING'; file: string }
  | { type: 'CONFIG_FILE_INVALID_JSON'; file: string; message: string }
  | { type: 'CONFIG_SCHEMA_INVALID'; file: string; message: string }
  | { type: 'PRESET_NOT_FOUND'; presetName: string }
  | { type: 'MODEL_NOT_IN_POOL'; presetName: string; agentType: AgentType; model: ModelConfig };
