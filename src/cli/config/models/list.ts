import { formatModelConfig } from '../../../config/index.js';
import { exit } from '../../../exit.js';
import { requireModelsConfigOrExit } from '../utils.js';

/**
 * Handles the "models list" command.
 *
 * @param options - Command options.
 * @param options.json - Output as JSON.
 * @returns Resolves when the operation completes.
 */
const handleModelsList = async (options: { json: boolean }): Promise<void> => {
  const config = await requireModelsConfigOrExit({ usePrompts: false });
  if (!config) return;

  const sortedModels = [...config.models].sort((firstModel, secondModel) => {
    const firstFormatted = formatModelConfig(firstModel);
    const secondFormatted = formatModelConfig(secondModel);
    return firstFormatted.localeCompare(secondFormatted);
  });

  if (options.json) {
    const payload = sortedModels.map((model) => ({
      providerID: model.providerID,
      modelID: model.modelID,
    }));
    console.log(JSON.stringify(payload, null, 2));
    await exit(0);
    return;
  }

  if (sortedModels.length === 0) {
    console.log('No models added.');
    await exit(0);
    return;
  }

  console.log(`Models in pool (${sortedModels.length}):`);
  for (const model of sortedModels) {
    console.log(`  • ${formatModelConfig(model)}`);
  }

  await exit(0);
};

export { handleModelsList };
