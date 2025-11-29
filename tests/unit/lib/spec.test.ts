import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';
import { parseSpecification, loadSpecification } from '../../../src/lib/spec.js';
import { fsUtils } from '../../../src/lib/fs.js';
import { createAppError } from '../../../src/types/errors.js';

const minimalSpecYaml = `
overview:
  summary: Minimal spec summary
constraints:
  - Must do the thing
acceptance_criteria:
  - Done when it works
scope:
  include:
    - src/**
`;

describe('parseSpecification', () => {
  it('parses a minimal valid spec', () => {
    const result = parseSpecification(minimalSpecYaml);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.overview.summary).toBe('Minimal spec summary');
      expect(result.value.constraints).toEqual(['Must do the thing']);
      expect(result.value.acceptance_criteria).toEqual(['Done when it works']);
      expect(result.value.scope.include).toEqual(['src/**']);
      expect(result.value.scope.exclude).toBeUndefined();
      expect(result.value.implementation_patterns).toBeUndefined();
      expect(result.value.motivation).toBeUndefined();
    }
  });

  it('accepts guidelines when constraints are absent', () => {
    const yaml = `
overview:
  summary: Uses guidelines only
implementation_patterns:
  guidelines:
    - Follow the pattern
acceptance_criteria:
  - Works
scope:
  include:
    - src/**
`;
    const result = parseSpecification(yaml);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.constraints).toBeUndefined();
      expect(result.value.implementation_patterns?.guidelines).toEqual(['Follow the pattern']);
    }
  });

  it('rejects when neither constraints nor guidelines are provided', () => {
    const yaml = `
overview:
  summary: Missing guardrails
acceptance_criteria:
  - Still needs guardrails
scope:
  include:
    - src/**
`;
    const result = parseSpecification(yaml);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects invalid overviews', () => {
    const yaml = `
overview:
  summary: ""
constraints:
  - guardrail
acceptance_criteria:
  - ok
scope:
  include:
    - src/**
`;
    const result = parseSpecification(yaml);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('parses edge cases and optional exclude', () => {
    const yaml = `
overview:
  summary: With edges
constraints:
  - guardrail
acceptance_criteria:
  - ok
edge_cases:
  - name: missing_metadata
    result: unknown
    handling: Prompt sync
scope:
  include:
    - src/**
  exclude:
    - scripts/**
`;
    const result = parseSpecification(yaml);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.edge_cases?.[0]).toEqual({
        name: 'missing_metadata',
        result: 'unknown',
        handling: 'Prompt sync',
      });
      expect(result.value.scope.exclude).toEqual(['scripts/**']);
    }
  });
});

describe('loadSpecification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and parses spec content from fsUtils', async () => {
    vi.spyOn(fsUtils, 'fsReadFile').mockReturnValue(okAsync(minimalSpecYaml));

    const result = await loadSpecification('spec.yaml');

    expect(result.isOk()).toBe(true);
  });

  it('returns an error when fsUtils fails', async () => {
    vi.spyOn(fsUtils, 'fsReadFile').mockReturnValue(errAsync(createAppError('FS_ERROR', 'boom')));

    const result = await loadSpecification('spec.yaml');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('FS_ERROR');
    }
  });
});
