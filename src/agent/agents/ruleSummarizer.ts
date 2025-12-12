import { err, ok, Result } from 'neverthrow';
import { createAppError, type AppError } from '../../types/errors.js';
import type { RuleSummarizer, RuleSummary } from '../../lib/rules/normalize.js';
import { createAgentRuntime } from '../runtime/index.js';
import { unwrapCodeFence } from '../../lib/utils.js';

const validateGeneratedTags = (value: unknown, rulePath: string): Result<string[], AppError> => {
  if (!Array.isArray(value)) {
    return err(
      createAppError('LLM_ERROR', `Model response for ${rulePath} must include a tags array`, {
        path: rulePath,
      }),
    );
  }

  const tags: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      return err(
        createAppError('LLM_ERROR', `Model tags for ${rulePath} must be strings`, {
          path: rulePath,
        }),
      );
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      return err(
        createAppError('LLM_ERROR', `Model tags for ${rulePath} must not be empty`, {
          path: rulePath,
        }),
      );
    }
    tags.push(trimmed);
  }

  return ok(tags);
};

const validateGeneratedDescription = (
  value: unknown,
  rulePath: string,
): Result<string, AppError> => {
  if (typeof value !== 'string') {
    return err(
      createAppError(
        'LLM_ERROR',
        `Model response for ${rulePath} must include a description string`,
        {
          path: rulePath,
        },
      ),
    );
  }

  const trimmed = value.trim().slice(0, 160);
  if (!trimmed) {
    return err(
      createAppError('LLM_ERROR', `Model description for ${rulePath} must not be empty`, {
        path: rulePath,
      }),
    );
  }

  return ok(trimmed);
};

const validateModelResponse = (raw: string, rulePath: string): Result<RuleSummary, AppError> => {
  const normalized = unwrapCodeFence(raw);
  let parsed: unknown;

  try {
    parsed = JSON.parse(normalized);
  } catch (error) {
    return err(
      createAppError(
        'LLM_ERROR',
        `Model response for ${rulePath} is not valid JSON: ${(error as Error).message}`,
        { path: rulePath, raw },
      ),
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    return err(
      createAppError('LLM_ERROR', `Model response for ${rulePath} must be an object`, {
        path: rulePath,
        raw,
      }),
    );
  }

  const descriptionResult = validateGeneratedDescription(
    (parsed as Record<string, unknown>).description,
    rulePath,
  );
  if (descriptionResult.isErr()) return err(descriptionResult.error);

  const tagsResult = validateGeneratedTags((parsed as Record<string, unknown>).tags, rulePath);
  if (tagsResult.isErr()) return err(tagsResult.error);

  return ok({
    description: descriptionResult.value,
    tags: tagsResult.value,
  });
};

/**
 * Generates a rule summarizer that uses the configured language model.
 *
 * @returns Function that summarizes rule path/content into description and tags; AppError on model or parsing failures. Never throws.
 */
const createModelSummarizer = (): Result<RuleSummarizer, AppError> =>
  createAgentRuntime().map(
    (runtime) => (input) =>
      runtime
        .generateText({
          messages: [
            {
              role: 'system',
              content:
                'Summarize the rule file. Respond with JSON: {"description": "...", "tags": ["scope","feature"]}. Description should explain the rule intent in <=160 characters. Tags should be 1-5 concise scopes (e.g., auth, ui, api, data). Return JSON only.',
            },
            {
              role: 'user',
              content: `Rule path: ${input.path}\n\nContent:\n${input.content}`,
            },
          ],
          temperature: 0.2,
        })
        .andThen((result) => validateModelResponse(result.text, input.path)),
  );

export const ruleSummarizer = {
  createModelSummarizer,
};
