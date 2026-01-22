import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { telemetryIO, createTelemetryIO, RUNS_DIR } from '../../../src/telemetry/io.js';
import { createTempDir } from '../../helpers/tempDir.js';

describe('telemetry/io', () => {
  describe('getRunPaths', () => {
    it('returns correct paths for simple runId', () => {
      const paths = telemetryIO.getRunPaths('run-123');
      expect(paths.runDir).toBe(join(RUNS_DIR, 'run-123'));
      expect(paths.agentsDir).toBe(join(RUNS_DIR, 'run-123', 'agents'));
      expect(paths.manifestPath).toBe(join(RUNS_DIR, 'run-123', 'manifest.md'));
    });

    it('returns correct paths for runId with special characters', () => {
      const runId = 'run_2026-01-21_12-00-00';
      const paths = telemetryIO.getRunPaths(runId);
      expect(paths.runDir).toBe(join(RUNS_DIR, runId));
      expect(paths.agentsDir).toBe(join(RUNS_DIR, runId, 'agents'));
      expect(paths.manifestPath).toBe(join(RUNS_DIR, runId, 'manifest.md'));
    });

    it('handles empty runId', () => {
      const paths = telemetryIO.getRunPaths('');
      expect(paths.runDir).toBe(RUNS_DIR);
      expect(paths.agentsDir).toBe(join(RUNS_DIR, 'agents'));
      expect(paths.manifestPath).toBe(join(RUNS_DIR, 'manifest.md'));
    });

    it('paths are consistent across calls', () => {
      const paths1 = telemetryIO.getRunPaths('test-run');
      const paths2 = telemetryIO.getRunPaths('test-run');
      expect(paths1).toEqual(paths2);
    });
  });

  describe('createTelemetryIO', () => {
    it('creates IO functions with custom base directory', () => {
      const customIO = createTelemetryIO('/custom/path');
      const paths = customIO.getRunPaths('my-run');

      expect(paths.runDir).toBe('/custom/path/my-run');
      expect(paths.agentsDir).toBe('/custom/path/my-run/agents');
      expect(paths.manifestPath).toBe('/custom/path/my-run/manifest.md');
    });

    it('isolates instances with different base directories', () => {
      const io1 = createTelemetryIO('/path1');
      const io2 = createTelemetryIO('/path2');

      expect(io1.getRunPaths('run').runDir).toBe('/path1/run');
      expect(io2.getRunPaths('run').runDir).toBe('/path2/run');
    });
  });

  describe('writeAgentCallFile', () => {
    it('writes file to correct path with correct content', async () => {
      const temp = await createTempDir();
      try {
        const io = createTelemetryIO(temp.path);
        const runId = 'test-run';
        const filename = '001-coding.md';
        const content = '---\nagent: codingAgent\n---\n\n# Test';

        const result = await io.writeAgentCallFile(runId, filename, content);

        expect(result.isOk()).toBe(true);

        const expectedPath = join(temp.path, runId, 'agents', filename);
        const written = await readFile(expectedPath, 'utf8');
        expect(written).toBe(content);
      } finally {
        await temp.cleanup();
      }
    });

    it('creates nested directories automatically', async () => {
      const temp = await createTempDir();
      try {
        const io = createTelemetryIO(temp.path);
        const runId = 'deep/nested/run';
        const filename = '001-master.md';
        const content = 'test content';

        const result = await io.writeAgentCallFile(runId, filename, content);

        expect(result.isOk()).toBe(true);

        const expectedPath = join(temp.path, runId, 'agents', filename);
        const written = await readFile(expectedPath, 'utf8');
        expect(written).toBe(content);
      } finally {
        await temp.cleanup();
      }
    });

    it('overwrites existing file', async () => {
      const temp = await createTempDir();
      try {
        const io = createTelemetryIO(temp.path);
        const runId = 'test-run';
        const filename = '001-coding.md';

        await io.writeAgentCallFile(runId, filename, 'original content');
        const result = await io.writeAgentCallFile(runId, filename, 'new content');

        expect(result.isOk()).toBe(true);

        const expectedPath = join(temp.path, runId, 'agents', filename);
        const written = await readFile(expectedPath, 'utf8');
        expect(written).toBe('new content');
      } finally {
        await temp.cleanup();
      }
    });

    it('handles content with special characters', async () => {
      const temp = await createTempDir();
      try {
        const io = createTelemetryIO(temp.path);
        const runId = 'test-run';
        const filename = '001-coding.md';
        const content = '# Title\n\n```typescript\nconst x = "hello";\n```\n\nUnicode: 日本語 🎉';

        const result = await io.writeAgentCallFile(runId, filename, content);

        expect(result.isOk()).toBe(true);

        const expectedPath = join(temp.path, runId, 'agents', filename);
        const written = await readFile(expectedPath, 'utf8');
        expect(written).toBe(content);
      } finally {
        await temp.cleanup();
      }
    });

    it('generates correct filename pattern', async () => {
      const temp = await createTempDir();
      try {
        const io = createTelemetryIO(temp.path);
        const runId = 'test-run';

        // Test various filename patterns
        await io.writeAgentCallFile(runId, '001-coding.md', 'iteration 1');
        await io.writeAgentCallFile(runId, '042-master.md', 'iteration 42');
        await io.writeAgentCallFile(runId, '100-coding.md', 'iteration 100');

        const agentsDir = join(temp.path, runId, 'agents');
        expect(await readFile(join(agentsDir, '001-coding.md'), 'utf8')).toBe('iteration 1');
        expect(await readFile(join(agentsDir, '042-master.md'), 'utf8')).toBe('iteration 42');
        expect(await readFile(join(agentsDir, '100-coding.md'), 'utf8')).toBe('iteration 100');
      } finally {
        await temp.cleanup();
      }
    });
  });

  describe('writeManifestFile', () => {
    it('writes manifest to correct location', async () => {
      const temp = await createTempDir();
      try {
        const io = createTelemetryIO(temp.path);
        const runId = 'test-run';
        const content = '---\nrunId: test-run\nstatus: completed\n---\n\n# Run Summary';

        const result = await io.writeManifestFile(runId, content);

        expect(result.isOk()).toBe(true);

        const expectedPath = join(temp.path, runId, 'manifest.md');
        const written = await readFile(expectedPath, 'utf8');
        expect(written).toBe(content);
      } finally {
        await temp.cleanup();
      }
    });

    it('creates run directory if it does not exist', async () => {
      const temp = await createTempDir();
      try {
        const io = createTelemetryIO(temp.path);
        const runId = 'brand-new-run';
        const content = 'test manifest';

        const result = await io.writeManifestFile(runId, content);

        expect(result.isOk()).toBe(true);

        const expectedPath = join(temp.path, runId, 'manifest.md');
        const written = await readFile(expectedPath, 'utf8');
        expect(written).toBe(content);
      } finally {
        await temp.cleanup();
      }
    });

    it('handles empty content', async () => {
      const temp = await createTempDir();
      try {
        const io = createTelemetryIO(temp.path);
        const runId = 'test-run';

        const result = await io.writeManifestFile(runId, '');

        expect(result.isOk()).toBe(true);

        const expectedPath = join(temp.path, runId, 'manifest.md');
        const written = await readFile(expectedPath, 'utf8');
        expect(written).toBe('');
      } finally {
        await temp.cleanup();
      }
    });

    it('handles very large content', async () => {
      const temp = await createTempDir();
      try {
        const io = createTelemetryIO(temp.path);
        const runId = 'test-run';
        const content = 'x'.repeat(100000); // 100KB of data

        const result = await io.writeManifestFile(runId, content);

        expect(result.isOk()).toBe(true);

        const expectedPath = join(temp.path, runId, 'manifest.md');
        const written = await readFile(expectedPath, 'utf8');
        expect(written.length).toBe(100000);
      } finally {
        await temp.cleanup();
      }
    });

    it('overwrites existing manifest', async () => {
      const temp = await createTempDir();
      try {
        const io = createTelemetryIO(temp.path);
        const runId = 'test-run';

        await io.writeManifestFile(runId, 'initial manifest');
        const result = await io.writeManifestFile(runId, 'updated manifest');

        expect(result.isOk()).toBe(true);

        const expectedPath = join(temp.path, runId, 'manifest.md');
        const written = await readFile(expectedPath, 'utf8');
        expect(written).toBe('updated manifest');
      } finally {
        await temp.cleanup();
      }
    });
  });

  describe('RUNS_DIR export', () => {
    it('is a string ending with runs', () => {
      expect(typeof RUNS_DIR).toBe('string');
      expect(RUNS_DIR.endsWith('runs')).toBe(true);
    });

    it('contains .bluprint in path', () => {
      expect(RUNS_DIR).toContain('.bluprint');
    });
  });
});
