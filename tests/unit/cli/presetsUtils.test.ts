import { describe, expect, it } from 'bun:test';
import { parsePresetModelArgs } from '../../../src/cli/presets/utils.js';

describe('cli/presets utils', () => {
  it('parses preset model flags and reports invalid values', () => {
    const parsed = parsePresetModelArgs({
      coding: 'openai/gpt-4',
      plan: 'bad-format',
      commit: 'openai/gpt-3.5-turbo',
    });

    expect(parsed.preset.coding).toEqual({ providerID: 'openai', modelID: 'gpt-4' });
    expect(parsed.preset.commit).toEqual({ providerID: 'openai', modelID: 'gpt-3.5-turbo' });
    expect(parsed.invalid).toEqual([{ agentType: 'plan', value: 'bad-format' }]);
  });
});
