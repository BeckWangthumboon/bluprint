import { describe, it, expect } from 'vitest';
import { validateRulesArgs } from '../../../src/commands/rules.js';

describe('validateRulesArgs', () => {
  it('accepts embedded source with file', () => {
    const result = validateRulesArgs({
      'rules-source': 'embedded',
      'rules-embedded-file': 'AGENTS.md',
      json: true,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        rulesSource: 'embedded',
        rulesEmbeddedFile: 'AGENTS.md',
        json: true,
      });
    }
  });

  it('accepts directory source with dir', () => {
    const result = validateRulesArgs({
      'rules-source': 'directory',
      'rules-dir': '.agent',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        rulesSource: 'directory',
        rulesDir: '.agent',
        json: false,
      });
    }
  });

  it('rejects missing embedded file', () => {
    const result = validateRulesArgs({
      'rules-source': 'embedded',
    });

    expect(result.isErr()).toBe(true);
  });

  it('rejects missing directory', () => {
    const result = validateRulesArgs({
      'rules-source': 'directory',
    });

    expect(result.isErr()).toBe(true);
  });

  it('rejects invalid source', () => {
    const result = validateRulesArgs({
      'rules-source': 'unknown',
    });

    expect(result.isErr()).toBe(true);
  });
});
