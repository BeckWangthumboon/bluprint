import { err, errAsync, ok, Result, ResultAsync } from 'neverthrow';
import type { RulesArgs } from '../types/commands.js';
import type { SuccessInfo } from '../lib/exit.js';
import { ruleDiscovery } from '../lib/rules/discover.js';
import { ruleNormalize } from '../lib/rules/normalize.js';
import { ruleSummarizer } from '../agent/agents/ruleSummarizer.js';
import { ruleManifest } from '../lib/rules/manifest.js';
import { createAppError, type AppError } from '../types/errors.js';

const rules = (args: RulesArgs): ResultAsync<SuccessInfo, AppError> => {
  const discoveryInput =
    args.rulesSource === 'embedded'
      ? { embeddedRuleFile: args.rulesEmbeddedFile }
      : { centralizedRuleDir: args.rulesDir };

  return ruleDiscovery
    .discoverRules(discoveryInput)
    .andThen((sources) => {
      const summarizerResult = ruleSummarizer.createModelSummarizer();
      if (summarizerResult.isErr()) return errAsync(summarizerResult.error);

      return ruleNormalize.buildRuleReferences(sources, summarizerResult.value);
    })
    .andThen((references) => ruleManifest.writeDiscoveredRules(references).map(() => references))
    .map((references) => ({
      command: 'rules',
      message: `Discovered and indexed ${references.length} rule(s).`,
      details: args.json ? undefined : references.map((r) => r.path),
    }));
};

const validateRulesArgs = (argv: unknown): Result<RulesArgs, AppError> => {
  const source = (argv as Record<string, unknown>)['rules-source'];
  const embeddedFile = (argv as Record<string, unknown>)['rules-embedded-file'];
  const rulesDir = (argv as Record<string, unknown>)['rules-dir'];
  const jsonFlag = Boolean((argv as Record<string, unknown>).json);

  if (source !== 'embedded' && source !== 'directory') {
    return err(createAppError('VALIDATION_ERROR', '--rules-source must be embedded or directory'));
  }

  if (source === 'embedded') {
    if (!embeddedFile || typeof embeddedFile !== 'string' || !embeddedFile.trim()) {
      return err(
        createAppError(
          'VALIDATION_ERROR',
          '--rules-embedded-file is required when --rules-source=embedded',
        ),
      );
    }
    return ok({
      rulesSource: 'embedded',
      rulesEmbeddedFile: embeddedFile,
      json: jsonFlag,
    });
  }

  if (!rulesDir || typeof rulesDir !== 'string' || !rulesDir.trim()) {
    return err(
      createAppError('VALIDATION_ERROR', '--rules-dir is required when --rules-source=directory'),
    );
  }

  return ok({
    rulesSource: 'directory',
    rulesDir,
    json: jsonFlag,
  });
};

export { rules, validateRulesArgs };
