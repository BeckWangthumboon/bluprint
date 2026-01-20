import { describe, expect, it } from 'bun:test';
import type { ModelsConfig } from '../../src/config/index.js';
import { runCli } from '../helpers/cli.js';
import { readJsonFile, writeModelsConfig, getModelsConfigPath } from '../helpers/config.js';
import { createTempDir } from '../helpers/tempDir.js';

describe('models CLI', () => {
  it('rejects invalid model arguments', async () => {
    const temp = await createTempDir();
    try {
      const result = runCli(['models', 'add', '--model', 'bad-format', '--yes'], {
        cwd: temp.path,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid model format');
    } finally {
      await temp.cleanup();
    }
  });

  it('adds, lists, validates, and removes models', async () => {
    const temp = await createTempDir();
    try {
      const addResult = runCli(['models', 'add', '--model', 'openai/gpt-4', '--yes'], {
        cwd: temp.path,
      });
      expect(addResult.exitCode).toBe(0);

      const listResult = runCli(['models', 'list', '--json'], { cwd: temp.path });
      expect(listResult.exitCode).toBe(0);
      expect(JSON.parse(listResult.stdout)).toEqual([{ providerID: 'openai', modelID: 'gpt-4' }]);

      const validateResult = runCli(['models', 'validate', '--json'], { cwd: temp.path });
      expect(validateResult.exitCode).toBe(0);
      const validatePayload = JSON.parse(validateResult.stdout) as Array<{
        providerID: string;
        modelID: string;
        valid: boolean;
      }>;
      expect(validatePayload).toEqual([{ providerID: 'openai', modelID: 'gpt-4', valid: true }]);

      const removeResult = runCli(['models', 'remove', '--model', 'openai/gpt-4', '--yes'], {
        cwd: temp.path,
      });
      expect(removeResult.exitCode).toBe(0);

      const listAfter = runCli(['models', 'list', '--json'], { cwd: temp.path });
      expect(listAfter.exitCode).toBe(0);
      expect(JSON.parse(listAfter.stdout)).toEqual([]);
    } finally {
      await temp.cleanup();
    }
  });

  it('reports invalid models in json output', async () => {
    const temp = await createTempDir();
    try {
      const config: ModelsConfig = {
        models: [
          { providerID: 'openai', modelID: 'gpt-4' },
          { providerID: 'openai', modelID: 'not-a-model' },
        ],
        presets: {},
      };
      await writeModelsConfig(temp.path, config);

      const validateResult = runCli(['models', 'validate', '--json'], { cwd: temp.path });
      expect(validateResult.exitCode).toBe(1);

      const payload = JSON.parse(validateResult.stdout) as Array<{
        providerID: string;
        modelID: string;
        valid: boolean;
        reason?: string;
      }>;

      const invalid = payload.find((item) => item.modelID === 'not-a-model');
      expect(invalid?.valid).toBe(false);
      expect(invalid?.reason).toBe('not_found');
    } finally {
      await temp.cleanup();
    }
  });

  it('errors when removing models not in the pool', async () => {
    const temp = await createTempDir();
    try {
      const config: ModelsConfig = {
        models: [{ providerID: 'openai', modelID: 'gpt-4' }],
        presets: {},
      };
      await writeModelsConfig(temp.path, config);

      const result = runCli(['models', 'remove', '--model', 'openai/gpt-3.5-turbo', '--yes'], {
        cwd: temp.path,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not in pool');
    } finally {
      await temp.cleanup();
    }
  });

  it('errors when using --all with --model', async () => {
    const temp = await createTempDir();
    try {
      const result = runCli(['models', 'remove', '--all', '--model', 'openai/gpt-4', '--yes'], {
        cwd: temp.path,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Cannot use --all with --model');
    } finally {
      await temp.cleanup();
    }
  });

  it('returns empty json when validating with no models', async () => {
    const temp = await createTempDir();
    try {
      const config: ModelsConfig = { models: [], presets: {} };
      await writeModelsConfig(temp.path, config);

      const result = runCli(['models', 'validate', '--json'], { cwd: temp.path });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual([]);
    } finally {
      await temp.cleanup();
    }
  });

  it('removes all models with --all', async () => {
    const temp = await createTempDir();
    try {
      const config: ModelsConfig = {
        models: [
          { providerID: 'openai', modelID: 'gpt-4' },
          { providerID: 'openai', modelID: 'gpt-3.5-turbo' },
        ],
        presets: {},
      };
      await writeModelsConfig(temp.path, config);

      const removeResult = runCli(['models', 'remove', '--all', '--yes'], { cwd: temp.path });
      expect(removeResult.exitCode).toBe(0);

      const updated = await readJsonFile<ModelsConfig>(getModelsConfigPath(temp.path));
      expect(updated.models).toHaveLength(0);
    } finally {
      await temp.cleanup();
    }
  });
});
