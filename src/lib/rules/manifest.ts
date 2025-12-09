import { workspaceRules } from '../workspace/rules.js';
import type { BluprintConfig } from '../workspace/config.js';
import type { RuleReference } from '../../types/rules.js';
import type { AppError } from '../../types/errors.js';
import { ResultAsync } from 'neverthrow';

/**
 * Writes discovered rule references to the configured workspace rules index.
 *
 * @param config - Parsed Bluprint configuration supplying the index path.
 * @param rules - Rule references to persist.
 * @returns ResultAsync resolving when the manifest is written; AppError on write failure.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const writeDiscoveredRules = (
  config: BluprintConfig,
  rules: RuleReference[],
): ResultAsync<void, AppError> => workspaceRules.writeRulesIndex({ rules }, config);

export const ruleManifest = {
  writeDiscoveredRules,
};
