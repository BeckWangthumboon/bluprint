import { describe, expect, it } from 'bun:test';
import type { ModelsConfig, BluprintConfig } from '../../src/config/index.js';
import { DEFAULT_BLUPRINT_CONFIG } from '../../src/config/index.js';
import { runCli } from '../helpers/cli.js';
import {
  getBluprintConfigPath,
  getModelsConfigPath,
  readJsonFile,
  writeModelsConfig,
} from '../helpers/config.js';
import { createTempDir } from '../helpers/tempDir.js';

describe('presets CLI', () => {
  it('rejects missing preset name when using flags', async () => {
    const temp = await createTempDir();
    try {
      const config: ModelsConfig = {
        models: [{ providerID: 'openai', modelID: 'gpt-4' }],
        presets: {},
      };
      await writeModelsConfig(temp.path, config);

      const result = runCli(['presets', 'add', '--coding', 'openai/gpt-4'], {
        cwd: temp.path,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Preset name is required');
    } finally {
      await temp.cleanup();
    }
  });

  it('rejects missing model flags when adding a preset', async () => {
    const temp = await createTempDir();
    try {
      const config: ModelsConfig = {
        models: [{ providerID: 'openai', modelID: 'gpt-4' }],
        presets: {},
      };
      await writeModelsConfig(temp.path, config);

      const result = runCli(['presets', 'add', '--name', 'starter', '--coding', 'openai/gpt-4'], {
        cwd: temp.path,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing required model flag');
    } finally {
      await temp.cleanup();
    }
  });

  it('lists empty presets when none exist', async () => {
    const temp = await createTempDir();
    try {
      const config: ModelsConfig = { models: [], presets: {} };
      await writeModelsConfig(temp.path, config);

      const listResult = runCli(['presets', 'list', '--json'], { cwd: temp.path });
      expect(listResult.exitCode).toBe(0);
      expect(JSON.parse(listResult.stdout)).toEqual({
        defaultPreset: null,
        presets: [],
      });
    } finally {
      await temp.cleanup();
    }
  });

  it('rejects edits with no model updates provided', async () => {
    const temp = await createTempDir();
    try {
      const config: ModelsConfig = {
        models: [{ providerID: 'openai', modelID: 'gpt-4' }],
        presets: {
          starter: {
            coding: { providerID: 'openai', modelID: 'gpt-4' },
            master: { providerID: 'openai', modelID: 'gpt-4' },
            plan: { providerID: 'openai', modelID: 'gpt-4' },
            summarizer: { providerID: 'openai', modelID: 'gpt-4' },
            commit: { providerID: 'openai', modelID: 'gpt-4' },
          },
        },
      };
      await writeModelsConfig(temp.path, config);

      const result = runCli(['presets', 'edit', '--name', 'starter'], { cwd: temp.path });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('No model updates provided');
    } finally {
      await temp.cleanup();
    }
  });

  it('blocks default preset selection when models are invalid and --yes is missing', async () => {
    const temp = await createTempDir();
    try {
      const config: ModelsConfig = {
        models: [
          { providerID: 'openai', modelID: 'gpt-4' },
          { providerID: 'openai', modelID: 'gpt-3.5-turbo' },
        ],
        presets: {
          starter: {
            coding: { providerID: 'openai', modelID: 'gpt-4' },
            master: { providerID: 'openai', modelID: 'gpt-4' },
            plan: { providerID: 'openai', modelID: 'gpt-3.5-turbo' },
            summarizer: { providerID: 'openai', modelID: 'gpt-4' },
            commit: { providerID: 'openai', modelID: 'gpt-4' },
          },
        },
      };
      await writeModelsConfig(temp.path, config);

      const result = runCli(['presets', 'default', '--name', 'starter'], {
        cwd: temp.path,
        env: {
          BLUPRINT_TEST_OPENCODE_PROVIDERS: JSON.stringify({ openai: ['gpt-4'] }),
        },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Selected preset contains invalid models');
    } finally {
      await temp.cleanup();
    }
  });

  it('reports invalid status in presets list output', async () => {
    const temp = await createTempDir();
    try {
      const config: ModelsConfig = {
        models: [
          { providerID: 'openai', modelID: 'gpt-4' },
          { providerID: 'openai', modelID: 'gpt-3.5-turbo' },
        ],
        presets: {
          starter: {
            coding: { providerID: 'openai', modelID: 'gpt-4' },
            master: { providerID: 'openai', modelID: 'gpt-4' },
            plan: { providerID: 'openai', modelID: 'gpt-3.5-turbo' },
            summarizer: { providerID: 'openai', modelID: 'gpt-4' },
            commit: { providerID: 'openai', modelID: 'gpt-4' },
          },
        },
      };
      await writeModelsConfig(temp.path, config);

      const listResult = runCli(['presets', 'list', '--json'], {
        cwd: temp.path,
        env: {
          BLUPRINT_TEST_OPENCODE_PROVIDERS: JSON.stringify({ openai: ['gpt-4'] }),
        },
      });
      expect(listResult.exitCode).toBe(0);

      const payload = JSON.parse(listResult.stdout) as {
        presets: Array<{ name: string; status: { valid: boolean; reasons: string[] } }>;
      };
      expect(payload.presets[0]?.status.valid).toBe(false);
      expect(payload.presets[0]?.status.reasons.join(' ')).toContain('openai/gpt-3.5-turbo');
    } finally {
      await temp.cleanup();
    }
  });

  it('adds, edits, defaults, lists, and removes presets', async () => {
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

      const addResult = runCli(
        [
          'presets',
          'add',
          '--name',
          'starter',
          '--coding',
          'openai/gpt-4',
          '--master',
          'openai/gpt-4',
          '--plan',
          'openai/gpt-3.5-turbo',
          '--summarizer',
          'openai/gpt-4',
          '--commit',
          'openai/gpt-4',
        ],
        { cwd: temp.path }
      );
      expect(addResult.exitCode).toBe(0);

      const afterAdd = await readJsonFile<ModelsConfig>(getModelsConfigPath(temp.path));
      expect(afterAdd.presets.starter).toBeDefined();
      expect(afterAdd.presets.starter!.plan.modelID).toBe('gpt-3.5-turbo');

      const editResult = runCli(
        ['presets', 'edit', '--name', 'starter', '--plan', 'openai/gpt-4'],
        { cwd: temp.path }
      );
      expect(editResult.exitCode).toBe(0);

      const afterEdit = await readJsonFile<ModelsConfig>(getModelsConfigPath(temp.path));
      expect(afterEdit.presets.starter).toBeDefined();
      expect(afterEdit.presets.starter!.plan.modelID).toBe('gpt-4');

      const defaultResult = runCli(['presets', 'default', '--name', 'starter'], {
        cwd: temp.path,
      });
      expect(defaultResult.exitCode).toBe(0);

      const bluprintConfig = await readJsonFile<BluprintConfig>(getBluprintConfigPath(temp.path));
      expect(bluprintConfig.defaultPreset).toBe('starter');

      const listResult = runCli(['presets', 'list', '--json'], { cwd: temp.path });
      expect(listResult.exitCode).toBe(0);
      const listPayload = JSON.parse(listResult.stdout) as {
        defaultPreset: string | null;
        presets: Array<{
          name: string;
          status: { valid: boolean; reasons: string[] };
        }>;
      };
      expect(listPayload.defaultPreset).toBe('starter');
      expect(listPayload.presets).toHaveLength(1);
      expect(listPayload.presets[0]?.status.valid).toBe(true);
      expect(listPayload.presets[0]?.status.reasons).toEqual([]);

      const removeResult = runCli(['presets', 'remove', '--name', 'starter', '--yes'], {
        cwd: temp.path,
      });
      expect(removeResult.exitCode).toBe(0);

      const afterRemove = await readJsonFile<ModelsConfig>(getModelsConfigPath(temp.path));
      expect(afterRemove.presets.starter).toBeUndefined();

      const afterRemoveConfig = await readJsonFile<BluprintConfig>(
        getBluprintConfigPath(temp.path)
      );
      expect(afterRemoveConfig.defaultPreset).toBeUndefined();
      expect(afterRemoveConfig.limits).toEqual(DEFAULT_BLUPRINT_CONFIG.limits);
    } finally {
      await temp.cleanup();
    }
  });
});
