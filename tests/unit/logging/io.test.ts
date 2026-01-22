import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLoggingIO, loggingIO, RUNS_DIR } from '../../../src/logging/io.js';
import { createTempDir } from '../../helpers/tempDir.js';

describe('logging/io', () => {
  describe('getRunPaths', () => {
    it('returns correct paths for runId', () => {
      const paths = loggingIO.getRunPaths('run-123');
      expect(paths.runDir).toBe(join(RUNS_DIR, 'run-123'));
      expect(paths.sessionsDir).toBe(join(RUNS_DIR, 'run-123', 'sessions'));
      expect(paths.debugLogPath).toBe(join(RUNS_DIR, 'run-123', 'debug.log'));
    });
  });

  describe('createLoggingIO', () => {
    it('creates IO functions with custom base directory', () => {
      const customIO = createLoggingIO('/custom/path');
      const paths = customIO.getRunPaths('my-run');

      expect(paths.runDir).toBe('/custom/path/my-run');
      expect(paths.sessionsDir).toBe('/custom/path/my-run/sessions');
      expect(paths.debugLogPath).toBe('/custom/path/my-run/debug.log');
    });
  });

  describe('appendDebugLog', () => {
    it('appends content to debug log', async () => {
      const temp = await createTempDir();
      try {
        const io = createLoggingIO(temp.path);
        const runId = 'test-run';

        const first = await io.appendDebugLog(runId, 'first\n');
        const second = await io.appendDebugLog(runId, 'second\n');

        expect(first.isOk()).toBe(true);
        expect(second.isOk()).toBe(true);

        const expectedPath = join(temp.path, runId, 'debug.log');
        const written = await readFile(expectedPath, 'utf8');
        expect(written).toBe('first\nsecond\n');
      } finally {
        await temp.cleanup();
      }
    });
  });

  describe('writeSessionFile', () => {
    it('writes session file to correct path with correct content', async () => {
      const temp = await createTempDir();
      try {
        const io = createLoggingIO(temp.path);
        const runId = 'test-run';
        const filename = '001-coding-session.json';
        const content = '{"ok":true}';

        const result = await io.writeSessionFile(runId, filename, content);

        expect(result.isOk()).toBe(true);

        const expectedPath = join(temp.path, runId, 'sessions', filename);
        const written = await readFile(expectedPath, 'utf8');
        expect(written).toBe(content);
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
