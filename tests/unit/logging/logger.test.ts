import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ResultAsync } from 'neverthrow';
import { Logger } from '../../../src/logging/logger.js';
import { createLoggingIO } from '../../../src/logging/io.js';
import type { LoggingIO } from '../../../src/logging/io.js';
import type { OpenCodeSDKSession } from '../../../src/agent/opencodesdk.js';
import { createTempDir } from '../../helpers/tempDir.js';

describe('logging/logger', () => {
  it('debug writes JSON line to debug log io', () => {
    const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));
    const calls: string[] = [];
    const io: LoggingIO = {
      getRunPaths: () => ({ runDir: '', sessionsDir: '', debugLogPath: '' }),
      appendDebugLog: (_runId, content) => {
        calls.push(content);
        return ResultAsync.fromPromise(Promise.resolve(), toError);
      },
      writeSessionFile: () => ResultAsync.fromPromise(Promise.resolve(), toError),
    };

    const logger = new Logger('run-1', io);
    logger.debug('SDK_EVENT', { foo: 'bar' });

    expect(calls.length).toBe(1);
    const firstCall = calls[0];
    if (!firstCall) {
      throw new Error('Expected debug log to be called');
    }
    const parsed = JSON.parse(firstCall.trim()) as { event: string; foo: string; ts: string };
    expect(parsed.event).toBe('SDK_EVENT');
    expect(parsed.foo).toBe('bar');
    expect(typeof parsed.ts).toBe('string');
  });

  it('logSession writes session file with expected name', async () => {
    const temp = await createTempDir();
    try {
      const io = createLoggingIO(temp.path);
      const logger = new Logger('run-123', io);

      const sessionId = 'session-abc';
      const sessionData: OpenCodeSDKSession = {
        id: sessionId,
        projectID: 'project-1',
        directory: '/tmp',
        title: 'test-session',
        version: 'v1',
        time: { created: 0, updated: 0 },
      };

      await logger.logSession(sessionId, sessionData, { agent: 'codingAgent', iteration: 7 });

      const expectedPath = join(temp.path, 'run-123', 'sessions', '007-coding-session-abc.json');
      const written = await readFile(expectedPath, 'utf8');
      expect(written).toBe(JSON.stringify(sessionData, null, 2));
    } finally {
      await temp.cleanup();
    }
  });
});
