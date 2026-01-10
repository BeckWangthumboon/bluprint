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

export const GraphiteConfigSchema = z.object({
  enabled: z.boolean(),
});

export const BluprintConfigSchema = z.object({
  limits: LimitsConfigSchema,
  timeouts: TimeoutsConfigSchema,
  defaultPreset: z.string().min(1).optional(),
  specFile: z.string().min(1),
  graphite: GraphiteConfigSchema,
});

/**
 * GeneralConfig is BluprintConfig without the preset-specific fields.
 * This derived schema ensures new fields added to BluprintConfigSchema
 * are automatically included in GeneralConfig.
 */
export const GeneralConfigSchema = BluprintConfigSchema.omit({ defaultPreset: true });

export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type AgentType = z.infer<typeof AgentTypeSchema>;
export type ModelPreset = z.infer<typeof ModelPresetSchema>;
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;
export type LimitsConfig = z.infer<typeof LimitsConfigSchema>;
export type TimeoutsConfig = z.infer<typeof TimeoutsConfigSchema>;
export type GraphiteConfig = z.infer<typeof GraphiteConfigSchema>;
export type BluprintConfig = z.infer<typeof BluprintConfigSchema>;
export type GeneralConfig = z.infer<typeof GeneralConfigSchema>;

export interface ResolvedConfig {
  limits: LimitsConfig;
  timeouts: TimeoutsConfig;
  preset: ModelPreset;
  presetName: string;
  graphite: GraphiteConfig;
}

/**
 * Parses a digit-only string into a positive integer.
 * Used for CLI input validation.
 */
export const PositiveIntFromStringSchema = z
  .string()
  .regex(/^\d+$/, 'Expected a positive integer')
  .transform((v) => Number.parseInt(v, 10))
  .pipe(z.number().int().positive());

/**
 * Trims whitespace and ensures the string is non-empty.
 * Used for CLI input validation.
 */
export const NonEmptyStringSchema = z.string().trim().min(1, 'Value cannot be empty');

/**
 * Parses a string into a boolean.
 * Accepts 'true' or 'false' (case-insensitive).
 * Used for CLI input validation.
 */
export const BooleanFromStringSchema = z
  .string()
  .toLowerCase()
  .transform((v) => {
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  })
  .pipe(z.boolean());
