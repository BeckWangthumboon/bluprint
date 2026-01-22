import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  RunTracker,
  initRunTracker,
  getRunTracker,
  resetRunTracker,
} from '../../../src/telemetry/runTracker.js';
import { createTelemetryIO } from '../../../src/telemetry/io.js';
import type { AgentCallData, ManifestData } from '../../../src/telemetry/types.js';
import { createTempDir } from '../../helpers/tempDir.js';

describe('telemetry/runTracker', () => {
  describe('RunTracker class', () => {
    describe('logAgentCall', () => {
      it('writes agent call file and returns Ok result', async () => {
        const temp = await createTempDir();
        try {
          const io = createTelemetryIO(temp.path);
          const tracker = new RunTracker('test-run', io);
          const data: AgentCallData = {
            agent: 'codingAgent',
            iteration: 1,
            planStep: 1,
            model: { providerID: 'openai', modelID: 'gpt-4' },
            sessionId: 'session-123',
            startedAt: new Date('2026-01-21T10:00:00Z'),
            endedAt: new Date('2026-01-21T10:01:00Z'),
            response: 'Test response',
          };

          const result = await tracker.logAgentCall(data);

          expect(result.isOk()).toBe(true);

          // Verify file was written with correct filename
          const filePath = join(temp.path, 'test-run', 'agents', '001-coding.md');
          const content = await readFile(filePath, 'utf8');
          expect(content).toContain('agent: codingAgent');
          expect(content).toContain('iteration: 1');
          expect(content).toContain('# Coding Agent - Iteration 1');
        } finally {
          await temp.cleanup();
        }
      });

      it('generates correct filename for masterAgent with iteration 42', async () => {
        const temp = await createTempDir();
        try {
          const io = createTelemetryIO(temp.path);
          const tracker = new RunTracker('test-run', io);
          const data: AgentCallData = {
            agent: 'masterAgent',
            iteration: 42,
            planStep: 3,
            model: { providerID: 'anthropic', modelID: 'claude-3' },
            sessionId: 'session-456',
            startedAt: new Date('2026-01-21T10:00:00Z'),
            endedAt: new Date('2026-01-21T10:02:00Z'),
            response: '{"decision":"accept"}',
          };

          const result = await tracker.logAgentCall(data);

          expect(result.isOk()).toBe(true);

          // Verify filename is 042-master.md
          const filePath = join(temp.path, 'test-run', 'agents', '042-master.md');
          const content = await readFile(filePath, 'utf8');
          expect(content).toContain('agent: masterAgent');
          expect(content).toContain('iteration: 42');
          expect(content).toContain('# Master Agent - Iteration 42');
        } finally {
          await temp.cleanup();
        }
      });

      it('includes error field in frontmatter and body when present', async () => {
        const temp = await createTempDir();
        try {
          const io = createTelemetryIO(temp.path);
          const tracker = new RunTracker('test-run', io);
          const data: AgentCallData = {
            agent: 'codingAgent',
            iteration: 1,
            planStep: 1,
            model: { providerID: 'openai', modelID: 'gpt-4' },
            sessionId: 'session-123',
            startedAt: new Date('2026-01-21T10:00:00Z'),
            endedAt: new Date('2026-01-21T10:01:00Z'),
            response: 'Partial response',
            error: 'Timeout error',
          };

          const result = await tracker.logAgentCall(data);

          expect(result.isOk()).toBe(true);

          const filePath = join(temp.path, 'test-run', 'agents', '001-coding.md');
          const content = await readFile(filePath, 'utf8');
          expect(content).toContain('error: Timeout error');
          expect(content).toContain('## Error');
          expect(content).toContain('Timeout error');
        } finally {
          await temp.cleanup();
        }
      });

      it('includes decision field in frontmatter when present', async () => {
        const temp = await createTempDir();
        try {
          const io = createTelemetryIO(temp.path);
          const tracker = new RunTracker('test-run', io);
          const data: AgentCallData = {
            agent: 'masterAgent',
            iteration: 1,
            planStep: 1,
            model: { providerID: 'openai', modelID: 'gpt-4' },
            sessionId: 'session-123',
            startedAt: new Date('2026-01-21T10:00:00Z'),
            endedAt: new Date('2026-01-21T10:01:00Z'),
            response: '{"decision":"reject","task":"fix bug"}',
            decision: 'reject',
          };

          const result = await tracker.logAgentCall(data);

          expect(result.isOk()).toBe(true);

          const filePath = join(temp.path, 'test-run', 'agents', '001-master.md');
          const content = await readFile(filePath, 'utf8');
          expect(content).toContain('decision: reject');
        } finally {
          await temp.cleanup();
        }
      });

      it('calculates duration correctly in frontmatter', async () => {
        const temp = await createTempDir();
        try {
          const io = createTelemetryIO(temp.path);
          const tracker = new RunTracker('test-run', io);
          const startedAt = new Date('2026-01-21T10:00:00Z');
          const endedAt = new Date('2026-01-21T10:01:30Z'); // 90 seconds later

          const data: AgentCallData = {
            agent: 'codingAgent',
            iteration: 1,
            planStep: 1,
            model: { providerID: 'openai', modelID: 'gpt-4' },
            sessionId: 'session-123',
            startedAt,
            endedAt,
            response: 'Test',
          };

          const result = await tracker.logAgentCall(data);

          expect(result.isOk()).toBe(true);

          const filePath = join(temp.path, 'test-run', 'agents', '001-coding.md');
          const content = await readFile(filePath, 'utf8');
          expect(content).toContain('durationMs: 90000');
        } finally {
          await temp.cleanup();
        }
      });

      it('pads iteration number to 3 digits', async () => {
        const temp = await createTempDir();
        try {
          const io = createTelemetryIO(temp.path);
          const tracker = new RunTracker('test-run', io);

          const baseData: AgentCallData = {
            agent: 'codingAgent',
            iteration: 1,
            planStep: 1,
            model: { providerID: 'openai', modelID: 'gpt-4' },
            sessionId: 'session-123',
            startedAt: new Date(),
            endedAt: new Date(),
            response: 'Test',
          };

          // Iteration 1 -> 001
          const result1 = await tracker.logAgentCall({ ...baseData, iteration: 1 });
          expect(result1.isOk()).toBe(true);

          // Iteration 99 -> 099
          const result99 = await tracker.logAgentCall({ ...baseData, iteration: 99 });
          expect(result99.isOk()).toBe(true);

          // Iteration 100 -> 100
          const result100 = await tracker.logAgentCall({ ...baseData, iteration: 100 });
          expect(result100.isOk()).toBe(true);

          // Verify files exist with correct names
          const agentsDir = join(temp.path, 'test-run', 'agents');
          await readFile(join(agentsDir, '001-coding.md'), 'utf8');
          await readFile(join(agentsDir, '099-coding.md'), 'utf8');
          await readFile(join(agentsDir, '100-coding.md'), 'utf8');
        } finally {
          await temp.cleanup();
        }
      });

      it('formats master agent response with decision parsing', async () => {
        const temp = await createTempDir();
        try {
          const io = createTelemetryIO(temp.path);
          const tracker = new RunTracker('test-run', io);
          const data: AgentCallData = {
            agent: 'masterAgent',
            iteration: 1,
            planStep: 1,
            model: { providerID: 'openai', modelID: 'gpt-4' },
            sessionId: 'session-123',
            startedAt: new Date('2026-01-21T10:00:00Z'),
            endedAt: new Date('2026-01-21T10:01:00Z'),
            response: '{"decision":"reject","task":"fix the bug"}',
          };

          const result = await tracker.logAgentCall(data);

          expect(result.isOk()).toBe(true);

          const filePath = join(temp.path, 'test-run', 'agents', '001-master.md');
          const content = await readFile(filePath, 'utf8');
          expect(content).toContain('Decision: reject');
          expect(content).toContain('Task: fix the bug');
        } finally {
          await temp.cleanup();
        }
      });
    });

    describe('writeManifest', () => {
      it('writes manifest file with completed status', async () => {
        const temp = await createTempDir();
        try {
          const io = createTelemetryIO(temp.path);
          const tracker = new RunTracker('test-run', io);
          const data: ManifestData = {
            runId: 'test-run',
            startedAt: new Date('2026-01-21T10:00:00Z'),
            endedAt: new Date('2026-01-21T10:30:00Z'),
            status: 'completed',
            totalIterations: 5,
            inputSizes: { spec: 1000, plan: 2000, summary: 500 },
            iterations: [],
          };

          const result = await tracker.writeManifest(data);

          expect(result.isOk()).toBe(true);

          const filePath = join(temp.path, 'test-run', 'manifest.md');
          const content = await readFile(filePath, 'utf8');
          expect(content).toContain('status: completed');
          expect(content).toContain('Completed 5 iterations');
        } finally {
          await temp.cleanup();
        }
      });

      it('writes manifest with failed status and error', async () => {
        const temp = await createTempDir();
        try {
          const io = createTelemetryIO(temp.path);
          const tracker = new RunTracker('test-run', io);
          const data: ManifestData = {
            runId: 'test-run',
            startedAt: new Date('2026-01-21T10:00:00Z'),
            endedAt: new Date('2026-01-21T10:15:00Z'),
            status: 'failed',
            totalIterations: 3,
            inputSizes: { spec: 1000, plan: 2000, summary: 500 },
            error: 'Agent timeout after 5 retries',
            iterations: [],
          };

          const result = await tracker.writeManifest(data);

          expect(result.isOk()).toBe(true);

          const filePath = join(temp.path, 'test-run', 'manifest.md');
          const content = await readFile(filePath, 'utf8');
          expect(content).toContain('status: failed');
          expect(content).toContain('Failed after 3 iterations');
          expect(content).toContain('Agent timeout after 5 retries');
        } finally {
          await temp.cleanup();
        }
      });

      it('writes manifest with aborted status', async () => {
        const temp = await createTempDir();
        try {
          const io = createTelemetryIO(temp.path);
          const tracker = new RunTracker('test-run', io);
          const data: ManifestData = {
            runId: 'test-run',
            startedAt: new Date('2026-01-21T10:00:00Z'),
            endedAt: new Date('2026-01-21T10:10:00Z'),
            status: 'aborted',
            totalIterations: 2,
            inputSizes: { spec: 1000, plan: 2000, summary: 500 },
            iterations: [],
          };

          const result = await tracker.writeManifest(data);

          expect(result.isOk()).toBe(true);

          const filePath = join(temp.path, 'test-run', 'manifest.md');
          const content = await readFile(filePath, 'utf8');
          expect(content).toContain('status: aborted');
          expect(content).toContain('Aborted after 2 iterations');
        } finally {
          await temp.cleanup();
        }
      });

      it('writes manifest with in_progress status and no endedAt', async () => {
        const temp = await createTempDir();
        try {
          const io = createTelemetryIO(temp.path);
          const tracker = new RunTracker('test-run', io);
          const data: ManifestData = {
            runId: 'test-run',
            startedAt: new Date('2026-01-21T10:00:00Z'),
            status: 'in_progress',
            totalIterations: 1,
            inputSizes: { spec: 1000, plan: 2000, summary: 500 },
            iterations: [],
          };

          const result = await tracker.writeManifest(data);

          expect(result.isOk()).toBe(true);

          const filePath = join(temp.path, 'test-run', 'manifest.md');
          const content = await readFile(filePath, 'utf8');
          expect(content).toContain('status: in_progress');
          expect(content).toContain('In progress');
          expect(content).toContain('endedAt: null');
        } finally {
          await temp.cleanup();
        }
      });

      it('writes "No iterations completed" for empty iterations array', async () => {
        const temp = await createTempDir();
        try {
          const io = createTelemetryIO(temp.path);
          const tracker = new RunTracker('test-run', io);
          const data: ManifestData = {
            runId: 'test-run',
            startedAt: new Date('2026-01-21T10:00:00Z'),
            status: 'in_progress',
            totalIterations: 0,
            inputSizes: { spec: 0, plan: 0, summary: 0 },
            iterations: [],
          };

          const result = await tracker.writeManifest(data);

          expect(result.isOk()).toBe(true);

          const filePath = join(temp.path, 'test-run', 'manifest.md');
          const content = await readFile(filePath, 'utf8');
          expect(content).toContain('- No iterations completed');
        } finally {
          await temp.cleanup();
        }
      });

      it('formats iterations with all fields including commit hash truncation', async () => {
        const temp = await createTempDir();
        try {
          const io = createTelemetryIO(temp.path);
          const tracker = new RunTracker('test-run', io);
          const data: ManifestData = {
            runId: 'test-run',
            startedAt: new Date('2026-01-21T10:00:00Z'),
            endedAt: new Date('2026-01-21T10:30:00Z'),
            status: 'completed',
            totalIterations: 2,
            inputSizes: { spec: 1000, plan: 2000, summary: 500 },
            iterations: [
              {
                iteration: 1,
                planStep: 1,
                decision: 'reject',
                codingDurationMs: 30000,
                masterDurationMs: 5000,
              },
              {
                iteration: 2,
                planStep: 1,
                decision: 'accept',
                codingDurationMs: 45000,
                masterDurationMs: 3000,
                commit: {
                  hash: 'abc123def456789',
                  message: 'Fix the bug',
                },
              },
            ],
          };

          const result = await tracker.writeManifest(data);

          expect(result.isOk()).toBe(true);

          const filePath = join(temp.path, 'test-run', 'manifest.md');
          const content = await readFile(filePath, 'utf8');
          expect(content).toContain('Iteration 1 (Step 1)');
          expect(content).toContain('reject');
          expect(content).toContain('coding: 30.0s');
          expect(content).toContain('review: 5.0s');
          expect(content).toContain('Iteration 2 (Step 1)');
          expect(content).toContain('accept');
          expect(content).toContain('commit: abc123d'); // 7 chars
        } finally {
          await temp.cleanup();
        }
      });

      it('handles iterations with partial fields', async () => {
        const temp = await createTempDir();
        try {
          const io = createTelemetryIO(temp.path);
          const tracker = new RunTracker('test-run', io);
          const data: ManifestData = {
            runId: 'test-run',
            startedAt: new Date('2026-01-21T10:00:00Z'),
            endedAt: new Date('2026-01-21T10:30:00Z'),
            status: 'completed',
            totalIterations: 1,
            inputSizes: { spec: 1000, plan: 2000, summary: 500 },
            iterations: [
              {
                iteration: 1,
                planStep: 1,
                // No decision, no durations, no commit
              },
            ],
          };

          const result = await tracker.writeManifest(data);

          expect(result.isOk()).toBe(true);

          const filePath = join(temp.path, 'test-run', 'manifest.md');
          const content = await readFile(filePath, 'utf8');
          expect(content).toContain('- Iteration 1 (Step 1)');
          // Should not contain optional fields
          expect(content).not.toContain('coding:');
          expect(content).not.toContain('review:');
          expect(content).not.toContain('commit:');
        } finally {
          await temp.cleanup();
        }
      });
    });
  });

  describe('initRunTracker', () => {
    afterEach(() => {
      resetRunTracker();
    });

    it('returns a RunTracker instance', () => {
      const tracker = initRunTracker('new-run-id');
      expect(tracker).toBeInstanceOf(RunTracker);
    });

    it('creates tracker with specified runId', () => {
      const tracker = initRunTracker('my-unique-run');
      expect(tracker).toBeDefined();
    });
  });

  describe('getRunTracker', () => {
    afterEach(() => {
      resetRunTracker();
    });

    it('returns the current tracker after init', () => {
      initRunTracker('test-run-for-get');
      const tracker = getRunTracker();
      expect(tracker).toBeInstanceOf(RunTracker);
    });

    it('returns the same tracker that was initialized', () => {
      const initialized = initRunTracker('consistent-run');
      const retrieved = getRunTracker();
      expect(retrieved).toBe(initialized);
    });

    it('returns updated tracker after re-initialization', () => {
      const first = initRunTracker('first-run');
      const second = initRunTracker('second-run');
      const retrieved = getRunTracker();

      expect(retrieved).toBe(second);
      expect(retrieved).not.toBe(first);
    });
  });

  describe('getRunTracker error handling', () => {
    beforeEach(() => {
      // Ensure tracker is reset before each test
      resetRunTracker();
    });

    afterEach(() => {
      resetRunTracker();
    });

    it('throws error when not initialized', () => {
      expect(() => getRunTracker()).toThrow(
        'RunTracker not initialized - call initRunTracker() first'
      );
    });

    it('throws with helpful error message', () => {
      try {
        getRunTracker();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('initRunTracker()');
      }
    });
  });

  describe('resetRunTracker', () => {
    it('clears the current tracker', () => {
      initRunTracker('some-run');
      expect(() => getRunTracker()).not.toThrow();

      resetRunTracker();

      expect(() => getRunTracker()).toThrow();
    });

    it('allows re-initialization after reset', () => {
      initRunTracker('first-run');
      resetRunTracker();

      const newTracker = initRunTracker('second-run');
      expect(getRunTracker()).toBe(newTracker);
    });
  });
});
