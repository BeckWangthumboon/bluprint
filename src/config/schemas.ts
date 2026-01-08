import { z } from 'zod';

export const ModelConfigSchema = z.object({
  providerID: z.string().min(1),
  modelID: z.string().min(1),
});

export const AgentTypeSchema = z.enum(['coding', 'master', 'plan', 'summarizer', 'commit']);

export const AGENT_TYPES = AgentTypeSchema.options;

export const ModelPresetSchema = z.object({
  coding: ModelConfigSchema,
  master: ModelConfigSchema,
  plan: ModelConfigSchema,
  summarizer: ModelConfigSchema,
  commit: ModelConfigSchema,
});

export const ModelsConfigSchema = z.object({
  models: z.array(ModelConfigSchema),
  presets: z.record(z.string(), ModelPresetSchema),
});

export const LimitsConfigSchema = z.object({
  maxIterations: z.number().int().positive(),
  maxTimeMinutes: z.number().int().positive(),
});

export const TimeoutsConfigSchema = z.object({
  codingAgentMin: z.number().int().positive(),
  masterAgentMin: z.number().int().positive(),
  planAgentMin: z.number().int().positive(),
  summarizerAgentMin: z.number().int().positive(),
  commitAgentMin: z.number().int().positive(),
});

export const BluprintConfigSchema = z.object({
  limits: LimitsConfigSchema,
  timeouts: TimeoutsConfigSchema,
  defaultPreset: z.string().min(1).optional(),
});

export const GeneralConfigSchema = z.object({
  limits: LimitsConfigSchema,
  timeouts: TimeoutsConfigSchema,
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type AgentType = z.infer<typeof AgentTypeSchema>;
export type ModelPreset = z.infer<typeof ModelPresetSchema>;
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;
export type LimitsConfig = z.infer<typeof LimitsConfigSchema>;
export type TimeoutsConfig = z.infer<typeof TimeoutsConfigSchema>;
export type BluprintConfig = z.infer<typeof BluprintConfigSchema>;
export type GeneralConfig = z.infer<typeof GeneralConfigSchema>;

export interface ResolvedConfig {
  limits: LimitsConfig;
  timeouts: TimeoutsConfig;
  preset: ModelPreset;
  presetName: string;
}
