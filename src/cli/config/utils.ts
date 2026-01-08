import * as p from '@clack/prompts';
import type { ModelConfig, ModelPreset, AgentType } from '../../config/index.js';
import {
  AGENT_TYPES,
  configUtils,
  modelConfigEquals,
  formatModelConfig,
} from '../../config/index.js';
import { getOpenCodeLib, type Provider, type Lib } from '../../agent/opencodesdk.js';
import { exit } from '../../exit.js';

/**
 * Model validation status against pool and SDK.
 */
export interface ModelValidationStatus {
  inPool: boolean;
  validInOpenCode: boolean | null;
}

/**
 * SDK connection result with providers.
 */
export interface SDKWithProviders {
  lib: Lib;
  providers: Provider[];
}

/**
 * Finds all presets that reference a given model.
 *
 * Checks each preset's coding, master, plan, summarizer, and commit model slots.
 *
 * @param model - The model configuration to search for.
 * @param presets - The record of preset names to preset configurations.
 * @returns An array of preset names that use the specified model.
 */
export function findPresetsUsingModel(
  model: ModelConfig,
  presets: Record<string, ModelPreset>
): string[] {
  const matchingPresets: string[] = [];
  for (const [presetName, preset] of Object.entries(presets)) {
    if (
      modelConfigEquals(preset.coding, model) ||
      modelConfigEquals(preset.master, model) ||
      modelConfigEquals(preset.plan, model) ||
      modelConfigEquals(preset.summarizer, model) ||
      modelConfigEquals(preset.commit, model)
    ) {
      matchingPresets.push(presetName);
    }
  }
  return matchingPresets;
}

/**
 * Connects to OpenCode SDK with proper error handling.
 * Shows error message and exits if connection fails.
 *
 * @param usePrompts - Use p.note for errors (interactive) or console.error (non-interactive)
 * @returns The SDK lib instance, or null if connection failed and process is exiting
 */
export async function connectToOpenCodeOrExit(usePrompts: boolean): Promise<Lib | null> {
  const libResult = await getOpenCodeLib();
  if (libResult.isErr()) {
    if (usePrompts) {
      p.note('Failed to connect to OpenCode SDK', 'Error');
    } else {
      console.error('Failed to connect to OpenCode SDK');
    }
    await exit(1);
    return null;
  }
  return libResult.value;
}

/**
 * Connects to the OpenCode SDK and fetches all providers that have models.
 *
 * Displays a spinner while fetching and exits the process if the connection fails
 * or no providers with models are available.
 *
 * @returns The SDK library instance and list of providers with models, or null if an error occurred.
 */
export async function fetchProvidersWithModels(): Promise<SDKWithProviders | null> {
  const libResult = await getOpenCodeLib();
  if (libResult.isErr()) {
    p.note('Failed to connect to OpenCode SDK', 'Error');
    await exit(1);
    return null;
  }
  const lib = libResult.value;

  const s = p.spinner();
  s.start('Fetching providers...');
  const providersResult = await lib.provider.list();

  if (providersResult.isErr()) {
    s.stop('Failed to fetch providers', 1);
    p.note('Failed to list providers', 'Error');
    await exit(1);
    return null;
  }
  const providers = providersResult.value;
  s.stop('Providers fetched');

  return { lib, providers };
}

/**
 * Validates a single model against pool membership and SDK validity.
 *
 * @param model - The model to validate
 * @param poolModels - The array of models in the pool
 * @param lib - The OpenCode SDK library instance
 * @returns The validation status for the model
 */
export async function validateModel(
  model: ModelConfig,
  poolModels: ModelConfig[],
  lib: Lib,
  options: { usePrompts: boolean }
): Promise<ModelValidationStatus> {
  const inPool = poolModels.some((m) => modelConfigEquals(m, model));

  const validateResult = await lib.provider.validate(model.providerID, model.modelID);
  if (validateResult.isErr()) {
    const msg = `Failed to validate ${formatModelConfig(model)} in OpenCode`;
    if (options.usePrompts) {
      p.note(msg, 'Error');
    } else {
      console.error(msg);
    }
    await exit(1);
    return { inPool, validInOpenCode: null };
  }

  return { inPool, validInOpenCode: validateResult.value };
}

/**
 * Validates all unique models across multiple presets against the SDK.
 * Deduplicates models to minimize SDK calls.
 *
 * @param presets - Record of preset names to preset configurations
 * @param poolModels - The array of models in the pool
 * @param lib - The OpenCode SDK library instance
 * @returns A map from model key (providerID/modelID) to validation status
 */
export async function validateMultiplePresets(
  presets: Record<string, ModelPreset>,
  poolModels: ModelConfig[],
  lib: Lib,
  options: { usePrompts: boolean }
): Promise<Map<string, ModelValidationStatus>> {
  const uniqueModels = new Map<string, ModelConfig>();

  for (const preset of Object.values(presets)) {
    for (const agentType of AGENT_TYPES) {
      const model = preset[agentType];
      const key = formatModelConfig(model);
      if (!uniqueModels.has(key)) {
        uniqueModels.set(key, model);
      }
    }
  }

  // Validate each unique model sequentially
  const statusMap = new Map<string, ModelValidationStatus>();

  for (const [key, model] of uniqueModels) {
    const status = await validateModel(model, poolModels, lib, options);
    statusMap.set(key, status);
  }

  return statusMap;
}

/**
 * Validates all models in a single preset against pool and SDK.
 * Uses sequential validation for consistency.
 *
 * @param preset - The preset to validate
 * @param poolModels - The array of models in the pool
 * @param lib - The OpenCode SDK library instance
 * @returns Record mapping each agent type to its model's validation status
 */
export async function validatePresets(
  preset: ModelPreset,
  poolModels: ModelConfig[],
  lib: Lib,
  options: { usePrompts: boolean }
): Promise<Record<AgentType, ModelValidationStatus>> {
  const results: Partial<Record<AgentType, ModelValidationStatus>> = {};

  for (const agentType of AGENT_TYPES) {
    const model = preset[agentType];
    results[agentType] = await validateModel(model, poolModels, lib, options);
  }

  return results as Record<AgentType, ModelValidationStatus>;
}

/**
 * Formats a model with status indicators using emoji.
 *
 * Examples:
 *   "openai/gpt-4" - all good
 *   "openai/gpt-4 ✗ not in pool" - not in pool
 *   "openai/bad-model ✗ invalid" - invalid in SDK
 *   "openai/bad-model ✗ not in pool, invalid" - both issues
 *
 * @param model - The model configuration
 * @param status - The validation status
 * @returns Formatted string with status indicators if any issues exist
 */
export function formatModelWithStatus(model: ModelConfig, status: ModelValidationStatus): string {
  const base = formatModelConfig(model);
  const issues: string[] = [];

  if (!status.inPool) {
    issues.push('not in pool');
  }
  if (status.validInOpenCode === false) {
    issues.push('invalid');
  }

  if (issues.length === 0) {
    return base;
  }

  return `${base} ✗ ${issues.join(', ')}`;
}

/**
 * Builds model options for selection prompts with validation status hints.
 * Invalid models get a "✗ invalid" hint.
 *
 * @param models - The array of models to build options from
 * @param lib - The OpenCode SDK library instance
 * @returns Array of options with value, label, and optional hint
 */
export async function buildModelOptionsWithStatus(
  models: ModelConfig[],
  lib: Lib,
  options: { usePrompts: boolean }
): Promise<Array<{ value: string; label: string; hint?: string }>> {
  const modelOptions: Array<{ value: string; label: string; hint?: string }> = [];

  for (const model of models) {
    const formatted = formatModelConfig(model);
    let hint: string | undefined;

    const validateResult = await lib.provider.validate(model.providerID, model.modelID);
    if (validateResult.isErr()) {
      const msg = `Failed to validate ${formatted} in OpenCode`;
      if (options.usePrompts) {
        p.note(msg, 'Error');
      } else {
        console.error(msg);
      }
      await exit(1);
      return [];
    }
    if (!validateResult.value) {
      hint = '✗ invalid';
    }

    modelOptions.push({ value: formatted, label: formatted, hint });
  }

  return modelOptions.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Reads the models config, exiting with an error if unavailable.
 *
 * Displays an error message and exits the process if the config file is missing or unreadable.
 * Use `usePrompts: true` for interactive commands (uses p.note), `false` for non-interactive (uses console.error).
 *
 * @param options - Configuration options.
 * @param options.usePrompts - Whether to use interactive prompts for error display.
 * @returns The models config, or null if an error occurred and the process is exiting.
 */
export async function requireModelsConfigOrExit(options: {
  usePrompts: boolean;
}): Promise<import('../../config/index.js').ModelsConfig | null> {
  const result = await configUtils.models.read();
  if (result.isErr()) {
    const error = result.error;
    const missingMsg = "No models.json found. Run 'bluprint config models edit' first.";
    const errorMsg = 'Failed to read models config';
    const msg = error.type === 'CONFIG_FILE_MISSING' ? missingMsg : errorMsg;

    if (options.usePrompts) {
      p.note(msg, 'Error');
    } else {
      console.error(msg);
    }
    await exit(1);
    return null;
  }
  return result.value;
}
