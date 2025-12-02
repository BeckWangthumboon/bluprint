import { parse as parseYaml } from 'yaml';
import { err, ok, Result, ResultAsync } from 'neverthrow';
import { createAppError, type AppError } from '../types/errors.js';
import type {
  AcceptanceCriteria,
  Constraints,
  EdgeCases,
  Guidelines,
  ImplementationExample,
  ImplementationPatterns,
  Motivation,
  Overview,
  Scope,
  Specification,
} from '../types/spec.js';
import { fsUtils } from './fs.js';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isNonEmptyString);

const parseOverview = (input: unknown): Result<Overview, AppError> => {
  if (!isRecord(input) || !isNonEmptyString(input.summary)) {
    return err(
      createAppError(
        'VALIDATION_ERROR',
        'overview.summary is required and must be a non-empty string',
      ),
    );
  }

  if (input.goals !== undefined && !isStringArray(input.goals)) {
    return err(
      createAppError('VALIDATION_ERROR', 'overview.goals must be an array of non-empty strings'),
    );
  }

  return ok({
    summary: input.summary.trim(),
    goals: input.goals ? (input.goals as string[]).map((goal) => goal.trim()) : undefined,
  });
};

const parseMotivation = (input: unknown): Result<Motivation | undefined, AppError> => {
  if (input === undefined) {
    return ok(undefined);
  }

  if (!isRecord(input)) {
    return err(createAppError('VALIDATION_ERROR', 'motivation must be an object when provided'));
  }

  if (input.problem !== undefined && !isNonEmptyString(input.problem)) {
    return err(createAppError('VALIDATION_ERROR', 'motivation.problem must be a non-empty string'));
  }

  if (input.context !== undefined && !isStringArray(input.context)) {
    return err(
      createAppError('VALIDATION_ERROR', 'motivation.context must be an array of strings'),
    );
  }

  const problem = input.problem ? input.problem.trim() : undefined;
  const context = input.context
    ? (input.context as string[]).map((item) => item.trim())
    : undefined;

  if (!problem && (!context || context.length === 0)) {
    return ok(undefined);
  }

  return ok({ problem, context });
};

const parseConstraints = (input: unknown): Result<Constraints | undefined, AppError> => {
  if (input === undefined) {
    return ok(undefined);
  }

  if (!isStringArray(input)) {
    return err(
      createAppError('VALIDATION_ERROR', 'constraints must be an array of non-empty strings'),
    );
  }

  return ok((input as string[]).map((item) => item.trim()));
};

const parseGuidelines = (input: unknown): Result<Guidelines | undefined, AppError> => {
  if (input === undefined) {
    return ok(undefined);
  }

  if (!isStringArray(input)) {
    return err(
      createAppError(
        'VALIDATION_ERROR',
        'implementation_patterns.guidelines must be an array of non-empty strings',
      ),
    );
  }

  return ok((input as string[]).map((item) => item.trim()));
};

const parseExamples = (input: unknown): Result<ImplementationExample[] | undefined, AppError> => {
  if (input === undefined) {
    return ok(undefined);
  }

  if (!Array.isArray(input)) {
    return err(
      createAppError('VALIDATION_ERROR', 'implementation_patterns.examples must be an array'),
    );
  }

  const examples: ImplementationExample[] = [];

  for (const item of input) {
    if (!isRecord(item) || !isNonEmptyString(item.description) || !isNonEmptyString(item.path)) {
      return err(
        createAppError(
          'VALIDATION_ERROR',
          'Each implementation_patterns.examples entry must include non-empty description and path strings',
        ),
      );
    }

    examples.push({
      description: item.description.trim(),
      path: item.path.trim(),
    });
  }

  return ok(examples.length > 0 ? examples : undefined);
};

const parseImplementationPatterns = (
  input: unknown,
): Result<ImplementationPatterns | undefined, AppError> => {
  if (input === undefined) {
    return ok(undefined);
  }

  if (!isRecord(input)) {
    return err(
      createAppError('VALIDATION_ERROR', 'implementation_patterns must be an object when provided'),
    );
  }

  const guidelinesResult = parseGuidelines(input.guidelines);
  if (guidelinesResult.isErr()) {
    return err(guidelinesResult.error);
  }

  const examplesResult = parseExamples(input.examples);
  if (examplesResult.isErr()) {
    return err(examplesResult.error);
  }

  const guidelines = guidelinesResult.value;
  const examples = examplesResult.value;

  if (!guidelines && !examples) {
    return ok(undefined);
  }

  return ok({ guidelines, examples });
};

const parseAcceptanceCriteria = (input: unknown): Result<AcceptanceCriteria, AppError> => {
  if (!isStringArray(input) || input.length === 0) {
    return err(
      createAppError(
        'VALIDATION_ERROR',
        'acceptance_criteria is required and must be a non-empty array of strings',
      ),
    );
  }

  return ok((input as string[]).map((item) => item.trim()));
};

const parseEdgeCases = (input: unknown): Result<EdgeCases | undefined, AppError> => {
  if (input === undefined) {
    return ok(undefined);
  }

  if (!Array.isArray(input)) {
    return err(createAppError('VALIDATION_ERROR', 'edge_cases must be an array when provided'));
  }

  const cases = [];

  for (const item of input) {
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.name) ||
      !isNonEmptyString(item.result) ||
      !isNonEmptyString(item.handling)
    ) {
      return err(
        createAppError(
          'VALIDATION_ERROR',
          'Each edge_cases entry must include non-empty name, result, and handling strings',
        ),
      );
    }

    cases.push({
      name: item.name.trim(),
      result: item.result.trim(),
      handling: item.handling.trim(),
    });
  }

  return ok(cases.length > 0 ? cases : undefined);
};

const parseScope = (input: unknown): Result<Scope, AppError> => {
  if (!isRecord(input)) {
    return err(createAppError('VALIDATION_ERROR', 'scope is required and must be an object'));
  }

  if (!isStringArray(input.include) || input.include.length === 0) {
    return err(
      createAppError(
        'VALIDATION_ERROR',
        'scope.include is required and must list at least one path',
      ),
    );
  }

  if (input.exclude !== undefined && !isStringArray(input.exclude)) {
    return err(createAppError('VALIDATION_ERROR', 'scope.exclude must be an array of strings'));
  }

  return ok({
    include: (input.include as string[]).map((item) => item.trim()),
    exclude: input.exclude ? (input.exclude as string[]).map((item) => item.trim()) : undefined,
  });
};

const ensureGuardrails = (
  constraints: Constraints | undefined,
  patterns: ImplementationPatterns | undefined,
): Result<void, AppError> => {
  if (constraints && constraints.length > 0) {
    return ok(undefined);
  }

  if (patterns?.guidelines && patterns.guidelines.length > 0) {
    return ok(undefined);
  }

  return err(
    createAppError(
      'VALIDATION_ERROR',
      'Specification requires constraints or implementation_patterns.guidelines to provide guardrails',
    ),
  );
};

/**
 * Parses raw YAML specification content into a typed Specification object without throwing.
 *
 * @param yamlContent - Raw YAML string to parse.
 * @returns Result containing a typed Specification on success; AppError on parse or validation failure.
 */
const parseSpecification = (yamlContent: string): Result<Specification, AppError> => {
  let parsed: unknown;

  try {
    parsed = parseYaml(yamlContent);
  } catch (error) {
    return err(
      createAppError(
        'CONFIG_PARSE_ERROR',
        `Failed to parse specification YAML: ${(error as Error).message}`,
      ),
    );
  }

  if (!isRecord(parsed)) {
    return err(createAppError('VALIDATION_ERROR', 'Specification must be a YAML mapping'));
  }

  const overviewResult = parseOverview(parsed.overview);
  if (overviewResult.isErr()) return err(overviewResult.error);

  const motivationResult = parseMotivation(parsed.motivation);
  if (motivationResult.isErr()) return err(motivationResult.error);

  const constraintsResult = parseConstraints(parsed.constraints);
  if (constraintsResult.isErr()) return err(constraintsResult.error);

  const patternsResult = parseImplementationPatterns(parsed.implementation_patterns);
  if (patternsResult.isErr()) return err(patternsResult.error);

  const guardrailsResult = ensureGuardrails(constraintsResult.value, patternsResult.value);
  if (guardrailsResult.isErr()) return err(guardrailsResult.error);

  const acceptanceResult = parseAcceptanceCriteria(parsed.acceptance_criteria);
  if (acceptanceResult.isErr()) return err(acceptanceResult.error);

  const edgeCasesResult = parseEdgeCases(parsed.edge_cases);
  if (edgeCasesResult.isErr()) return err(edgeCasesResult.error);

  const scopeResult = parseScope(parsed.scope);
  if (scopeResult.isErr()) return err(scopeResult.error);

  return ok({
    overview: overviewResult.value,
    motivation: motivationResult.value,
    constraints: constraintsResult.value,
    implementation_patterns: patternsResult.value,
    acceptance_criteria: acceptanceResult.value,
    edge_cases: edgeCasesResult.value,
    scope: scopeResult.value,
  });
};

/**
 * Loads and parses a YAML specification file into a typed Specification object without throwing.
 *
 * @param specPath - Path to the specification YAML file, validated against the repo root.
 * @returns ResultAsync containing the Specification on success; AppError on read, parse, or validation failure.
 */
const loadSpecification = (specPath: string): ResultAsync<Specification, AppError> =>
  fsUtils.fsReadFile(specPath).andThen((contents) => parseSpecification(contents));

export { parseSpecification, loadSpecification };
