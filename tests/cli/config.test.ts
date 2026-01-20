import { describe, expect, it } from 'bun:test';
import type { BluprintConfig } from '../../src/config/index.js';
import { DEFAULT_BLUPRINT_CONFIG, DEFAULT_GENERAL_CONFIG } from '../../src/config/index.js';
import { runCli } from '../helpers/cli.js';
import { getBluprintConfigPath, readJsonFile, writeBluprintConfig } from '../helpers/config.js';
import { createTempDir } from '../helpers/tempDir.js';

describe('config CLI', () => {
  it('returns defaults for config list', async () => {
    const temp = await createTempDir();
    try {
      const result = runCli(['config', 'list', '--json'], { cwd: temp.path });
      expect(result.exitCode).toBe(0);

      const payload = JSON.parse(result.stdout) as typeof DEFAULT_GENERAL_CONFIG;
      expect(payload).toEqual(DEFAULT_GENERAL_CONFIG);
    } finally {
      await temp.cleanup();
    }
  });

  it('supports set/get/reset with json output', async () => {
    const temp = await createTempDir();
    try {
      const setResult = runCli(['config', 'set', 'limits.maxIterations', '12', '--json'], {
        cwd: temp.path,
      });
      expect(setResult.exitCode).toBe(0);
      expect(JSON.parse(setResult.stdout)).toEqual({});

      const getResult = runCli(['config', 'get', 'limits.maxIterations', '--json'], {
        cwd: temp.path,
      });
      expect(getResult.exitCode).toBe(0);
      expect(JSON.parse(getResult.stdout)).toEqual({
        key: 'limits.maxIterations',
        value: 12,
      });

      const resetResult = runCli(['config', 'reset', 'limits.maxIterations', '--json'], {
        cwd: temp.path,
      });
      expect(resetResult.exitCode).toBe(0);
      expect(JSON.parse(resetResult.stdout)).toEqual({});

      const afterReset = runCli(['config', 'get', 'limits.maxIterations', '--json'], {
        cwd: temp.path,
      });
      expect(afterReset.exitCode).toBe(0);
      expect(JSON.parse(afterReset.stdout)).toEqual({
        key: 'limits.maxIterations',
        value: DEFAULT_GENERAL_CONFIG.limits.maxIterations,
      });
    } finally {
      await temp.cleanup();
    }
  });

  it('returns json error payloads for invalid keys', async () => {
    const temp = await createTempDir();
    try {
      const result = runCli(['config', 'get', 'bad.key', '--json'], { cwd: temp.path });
      expect(result.exitCode).toBe(1);

      const payload = JSON.parse(result.stdout) as { error?: string };
      expect(payload.error ?? '').toContain('Invalid config key');
    } finally {
      await temp.cleanup();
    }
  });

  it('returns json error payloads for invalid values', async () => {
    const temp = await createTempDir();
    try {
      const result = runCli(['config', 'set', 'limits.maxIterations', 'not-a-number', '--json'], {
        cwd: temp.path,
      });
      expect(result.exitCode).toBe(1);

      const payload = JSON.parse(result.stdout) as { error?: string };
      expect(payload.error ?? '').toContain('Invalid value for limits.maxIterations');
    } finally {
      await temp.cleanup();
    }
  });

  it('returns json error payloads when reset is missing key and --all', async () => {
    const temp = await createTempDir();
    try {
      const result = runCli(['config', 'reset', '--json'], { cwd: temp.path });
      expect(result.exitCode).toBe(1);

      const payload = JSON.parse(result.stdout) as { error?: string };
      expect(payload.error ?? '').toContain('Missing config key');
    } finally {
      await temp.cleanup();
    }
  });

  it('preserves default preset when resetting all general config values', async () => {
    const temp = await createTempDir();
    try {
      const seededConfig: BluprintConfig = {
        ...DEFAULT_BLUPRINT_CONFIG,
        defaultPreset: 'starter',
        limits: {
          maxIterations: 123,
          maxTimeMinutes: 45,
        },
      };
      await writeBluprintConfig(temp.path, seededConfig);

      const result = runCli(['config', 'reset', '--all', '--json'], { cwd: temp.path });
      expect(result.exitCode).toBe(0);

      const updated = await readJsonFile<BluprintConfig>(getBluprintConfigPath(temp.path));
      expect(updated.defaultPreset).toBe('starter');
      expect(updated.limits).toEqual(DEFAULT_GENERAL_CONFIG.limits);
      expect(updated.timeouts).toEqual(DEFAULT_GENERAL_CONFIG.timeouts);
    } finally {
      await temp.cleanup();
    }
  });
});
