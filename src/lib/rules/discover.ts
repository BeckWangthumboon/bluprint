import path from 'path';
import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import { fsUtils } from '../fs.js';
import { gitUtils } from '../git.js';
import { shellUtils } from '../shell.js';
import { createAppError, type AppError } from '../../types/errors.js';
import type { BluprintConfig } from '../workspace/config.js';
import type { RuleSource } from '../../types/rules.js';

const ALLOWED_RULE_EXTENSIONS = new Set(['.md', '.mdc', '.yaml', '.yml']);

type RuleDiscoveryInput = {
  embeddedRuleFile?: string;
  centralizedRuleDir?: string;
};

const filterRuleFiles = (paths: string[]): string[] => {
  const deduped = new Set<string>();

  paths.forEach((relativePath) => {
    const ext = path.extname(relativePath).toLowerCase();
    if (!ALLOWED_RULE_EXTENSIONS.has(ext)) return;
    deduped.add(relativePath);
  });

  return Array.from(deduped);
};

const collectEmbeddedRules = (fileName: string): ResultAsync<RuleSource[], AppError> =>
  shellUtils
    .findByName(fileName, 'file', { includeHidden: true })
    .andThen((paths) => ResultAsync.combine(paths.map((p) => fsUtils.fsToRepoRelativePath(p))))
    .andThen((relativePaths) => {
      const validFiles = filterRuleFiles(relativePaths);
      if (validFiles.length === 0) {
        return errAsync(
          createAppError(
            'VALIDATION_ERROR',
            'Embedded rule files must have a supported extension (.md, .mdc, .yaml, .yml).',
            { fileName },
          ),
        );
      }

      return okAsync(validFiles.map((rulePath) => ({ path: rulePath })));
    });

const collectCentralizedRules = (dir: string): ResultAsync<RuleSource[], AppError> =>
  gitUtils.gitGetRepoRoot().andThen((repoRoot) =>
    fsUtils.fsToRepoRelativePath(dir).andThen((normalizedDir) =>
      fsUtils.fsStat(normalizedDir).andThen(() =>
        fsUtils.fsListFilesRecursive(normalizedDir).map((files) => {
          const relativeFiles = files.map((file) => path.relative(repoRoot, file));
          return filterRuleFiles(relativeFiles).map((rulePath) => ({ path: rulePath }));
        }),
      ),
    ),
  );

/**
 * Discovers rule file paths from user-supplied embedded files and centralized directories.
 *
 * @param input - User-provided rule file paths and directories to scan.
 * @returns ResultAsync containing repo-relative RuleSource entries; AppError when inputs are invalid or no rules found.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const discoverRules = (input: RuleDiscoveryInput): ResultAsync<RuleSource[], AppError> => {
  const hasEmbedded = Boolean(input.embeddedRuleFile);
  const hasCentralized = Boolean(input.centralizedRuleDir);

  if (hasEmbedded && hasCentralized) {
    return errAsync(
      createAppError(
        'VALIDATION_ERROR',
        'Provide only one rule mode: embeddedRuleFiles or centralizedRuleDirs, not both.',
        {
          embeddedRuleFile: input.embeddedRuleFile,
          centralizedRuleDir: input.centralizedRuleDir,
        },
      ),
    );
  }

  if (!hasEmbedded && !hasCentralized) {
    return errAsync(
      createAppError(
        'VALIDATION_ERROR',
        'No rule inputs provided. Supply embeddedRuleFiles or centralizedRuleDirs.',
        {
          embeddedRuleFile: input.embeddedRuleFile,
          centralizedRuleDir: input.centralizedRuleDir,
        },
      ),
    );
  }

  return gitUtils.gitGetRepoRoot().andThen((repoRoot) =>
    (hasEmbedded
      ? collectEmbeddedRules(input.embeddedRuleFile as string)
      : collectCentralizedRules(input.centralizedRuleDir as string)
    )
      .map((sources) => {
        const seen = new Set<string>();
        const deduped: RuleSource[] = [];

        sources.forEach((source) => {
          if (seen.has(source.path)) return;
          seen.add(source.path);
          deduped.push(source);
        });

        return deduped;
      })
      .andThen((sources) => {
        if (sources.length === 0) {
          return errAsync(
            createAppError(
              'CONFIG_NOT_FOUND',
              'No rules discovered. Provide embedded rule files or centralized rule directories.',
              {
                embeddedRuleFile: input.embeddedRuleFile,
                centralizedRuleDir: input.centralizedRuleDir,
              },
            ),
          );
        }

        return okAsync(sources);
      }),
  );
};

export const ruleDiscovery = {
  discoverRules,
};
export type { RuleDiscoveryInput };
