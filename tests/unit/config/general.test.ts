import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_GENERAL_CONFIG,
  getConfigValue,
  getDefaultForKey,
  getTimeoutMs,
  getValueFromPath,
  setConfigValue,
  setValueAtPath,
} from '../../../src/config/index.js';

describe('config/general helpers', () => {
  it('reads and writes values by path', () => {
    const value = getValueFromPath(DEFAULT_GENERAL_CONFIG, ['limits', 'maxIterations']);
    expect(value).toBe(50);

    const updated = setValueAtPath(
      DEFAULT_GENERAL_CONFIG as unknown as Record<string, unknown>,
      ['limits', 'maxIterations'],
      12
    );
    const updatedValue = getValueFromPath(updated as typeof DEFAULT_GENERAL_CONFIG, [
      'limits',
      'maxIterations',
    ]);
    expect(updatedValue).toBe(12);
    expect(DEFAULT_GENERAL_CONFIG.limits.maxIterations).toBe(50);
  });

  it('handles key-based updates', () => {
    const updated = setConfigValue('limits.maxIterations', 99, DEFAULT_GENERAL_CONFIG);
    expect(getConfigValue('limits.maxIterations', updated)).toBe(99);
    expect(getDefaultForKey('limits.maxIterations')).toBe(50);
  });

  it('converts timeouts to milliseconds', () => {
    const ms = getTimeoutMs(DEFAULT_GENERAL_CONFIG.timeouts, 'plan');
    expect(ms).toBe(DEFAULT_GENERAL_CONFIG.timeouts.planAgentMin * 60 * 1000);
  });
});
