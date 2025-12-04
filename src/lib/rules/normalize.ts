import path from 'path';
import { okAsync, ResultAsync } from 'neverthrow';
import { fsUtils } from '../fs.js';
import type { AppError } from '../../types/errors.js';
import type { RuleReference, RuleSource } from '../../types/rules.js';

type RuleSummary = {
  description: string;
  tags: string[];
};

type RuleSummarizer = (input: {
  path: string;
  content: string;
}) => ResultAsync<RuleSummary, AppError>;

/**
 * Builds a stable rule identifier from a repo-relative path.
 *
 * @param rulePath - Repo-relative path to the rule file.
 * @returns Slugified identifier with a short hash suffix for stability. Never throws.
 */
const buildRuleId = (rulePath: string): string => {
  const base = path.basename(rulePath, path.extname(rulePath));
  const slug =
    base
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'rule';
  const hash = Buffer.from(rulePath).toString('base64url').slice(0, 8);
  return `${slug}-${hash}`;
};

/**
 * Builds a RuleReference from a discovered rule source using a provided summarizer.
 *
 * @param source - RuleSource containing the repo-relative path to summarize.
 * @param summarize - Function that generates a description and tags from path/content.
 * @returns ResultAsync containing the constructed RuleReference; AppError on IO or summarization failure.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const buildRuleReference = (
  source: RuleSource,
  summarize: RuleSummarizer,
): ResultAsync<RuleReference, AppError> =>
  fsUtils.fsReadFile(source.path).andThen((content) =>
    summarize({ path: source.path, content }).andThen((summary) =>
      okAsync({
        id: buildRuleId(source.path),
        description: summary.description,
        path: source.path,
        tags: summary.tags,
      }),
    ),
  );

/**
 * Generates RuleReferences for a list of sources using the provided summarizer.
 *
 * @param sources - Discovered rule sources to summarize.
 * @param summarize - Function that generates a description and tags from path/content.
 * @returns ResultAsync containing all RuleReferences; AppError when any summarization or read fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const buildRuleReferences = (
  sources: RuleSource[],
  summarize: RuleSummarizer,
): ResultAsync<RuleReference[], AppError> =>
  ResultAsync.combine(sources.map((source) => buildRuleReference(source, summarize)));

export const ruleNormalize = {
  buildRuleId,
  buildRuleReference,
  buildRuleReferences,
};
export type { RuleSummarizer, RuleSummary };
