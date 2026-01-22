import { describe, expect, it } from 'bun:test';
import {
  serializeValue,
  toFrontmatter,
  formatDuration,
  isMasterAgentDecision,
  formatMasterAgentResponse,
  formatCodingAgentResponse,
} from '../../../src/telemetry/utils.js';

describe('telemetry/utils', () => {
  describe('serializeValue', () => {
    it('serializes null to "null"', () => {
      expect(serializeValue(null)).toBe('null');
    });

    it('serializes undefined to "null"', () => {
      expect(serializeValue(undefined)).toBe('null');
    });

    it('serializes Date to ISO string', () => {
      const date = new Date('2026-01-21T12:00:00.000Z');
      expect(serializeValue(date)).toBe('2026-01-21T12:00:00.000Z');
    });

    it('serializes string as-is', () => {
      expect(serializeValue('hello')).toBe('hello');
    });

    it('serializes number to string', () => {
      expect(serializeValue(42)).toBe('42');
      expect(serializeValue(3.14)).toBe('3.14');
      expect(serializeValue(0)).toBe('0');
      expect(serializeValue(-100)).toBe('-100');
    });

    it('serializes boolean to string', () => {
      expect(serializeValue(true)).toBe('true');
      expect(serializeValue(false)).toBe('false');
    });

    it('serializes bigint to string', () => {
      expect(serializeValue(BigInt(9007199254740991))).toBe('9007199254740991');
    });

    it('serializes symbol to string', () => {
      expect(serializeValue(Symbol('test'))).toBe('Symbol(test)');
      expect(serializeValue(Symbol())).toBe('Symbol()');
    });

    it('serializes named function', () => {
      function foo() {}
      expect(serializeValue(foo)).toBe('[Function foo]');
    });

    it('serializes anonymous function', () => {
      expect(serializeValue(() => {})).toBe('[Function]');
    });

    it('serializes empty array to "[]"', () => {
      expect(serializeValue([])).toBe('[]');
    });

    it('serializes simple array as list', () => {
      const result = serializeValue([1, 2, 3]);
      expect(result).toContain('- 1');
      expect(result).toContain('- 2');
      expect(result).toContain('- 3');
    });

    it('serializes nested object with indentation', () => {
      const result = serializeValue({ a: { b: 1 } });
      expect(result).toContain('a:');
      expect(result).toContain('b: 1');
    });

    it('serializes array of objects', () => {
      const result = serializeValue([{ x: 1 }, { x: 2 }]);
      expect(result).toContain('- ');
      expect(result).toContain('x: 1');
      expect(result).toContain('x: 2');
    });

    it('serializes deeply nested structures', () => {
      const result = serializeValue({ level1: { level2: { level3: 'deep' } } });
      expect(result).toContain('level1:');
      expect(result).toContain('level2:');
      expect(result).toContain('level3: deep');
    });
  });

  describe('toFrontmatter', () => {
    it('wraps content in --- delimiters', () => {
      const result = toFrontmatter({ name: 'test' });
      expect(result.startsWith('---\n')).toBe(true);
      expect(result.endsWith('\n---')).toBe(true);
    });

    it('serializes simple key-value pairs', () => {
      const result = toFrontmatter({ name: 'test', count: 42 });
      expect(result).toContain('name: test');
      expect(result).toContain('count: 42');
    });

    it('serializes nested objects with proper indentation', () => {
      const result = toFrontmatter({ model: { providerID: 'openai', modelID: 'gpt-4' } });
      expect(result).toContain('model:');
      expect(result).toContain('providerID: openai');
      expect(result).toContain('modelID: gpt-4');
    });

    it('serializes Date values to ISO strings', () => {
      const date = new Date('2026-01-21T12:00:00.000Z');
      const result = toFrontmatter({ startedAt: date });
      expect(result).toContain('startedAt: 2026-01-21T12:00:00.000Z');
    });

    it('handles null values', () => {
      const result = toFrontmatter({ endedAt: null });
      expect(result).toContain('endedAt: null');
    });

    it('handles multiple top-level keys', () => {
      const result = toFrontmatter({
        agent: 'codingAgent',
        iteration: 1,
        planStep: 2,
      });
      expect(result).toContain('agent: codingAgent');
      expect(result).toContain('iteration: 1');
      expect(result).toContain('planStep: 2');
    });
  });

  describe('formatDuration', () => {
    it('formats sub-second durations in ms', () => {
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(1)).toBe('1ms');
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('formats durations under 1 minute in seconds', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(30000)).toBe('30.0s');
      expect(formatDuration(59999)).toBe('60.0s');
    });

    it('formats durations of 1 minute or more in m s format', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(120000)).toBe('2m 0s');
      expect(formatDuration(3723000)).toBe('62m 3s');
    });

    it('handles edge cases around minute boundaries', () => {
      expect(formatDuration(59000)).toBe('59.0s');
      expect(formatDuration(60001)).toBe('1m 0s');
    });
  });

  describe('isMasterAgentDecision', () => {
    it('returns true for valid accept decision', () => {
      expect(isMasterAgentDecision({ decision: 'accept' })).toBe(true);
    });

    it('returns true for valid reject decision', () => {
      expect(isMasterAgentDecision({ decision: 'reject' })).toBe(true);
    });

    it('returns true for reject with task', () => {
      expect(isMasterAgentDecision({ decision: 'reject', task: 'fix the bug' })).toBe(true);
    });

    it('returns true for accept with extra fields', () => {
      expect(isMasterAgentDecision({ decision: 'accept', extra: 'ignored' })).toBe(true);
    });

    it('returns false for null', () => {
      expect(isMasterAgentDecision(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isMasterAgentDecision(undefined)).toBe(false);
    });

    it('returns false for non-object types', () => {
      expect(isMasterAgentDecision('string')).toBe(false);
      expect(isMasterAgentDecision(123)).toBe(false);
      expect(isMasterAgentDecision(true)).toBe(false);
      expect(isMasterAgentDecision([])).toBe(false);
    });

    it('returns false when decision field is missing', () => {
      expect(isMasterAgentDecision({ task: 'test' })).toBe(false);
      expect(isMasterAgentDecision({})).toBe(false);
    });

    it('returns false for invalid decision values', () => {
      expect(isMasterAgentDecision({ decision: 'maybe' })).toBe(false);
      expect(isMasterAgentDecision({ decision: 'approved' })).toBe(false);
      expect(isMasterAgentDecision({ decision: '' })).toBe(false);
      expect(isMasterAgentDecision({ decision: null })).toBe(false);
      expect(isMasterAgentDecision({ decision: 123 })).toBe(false);
    });

    it('returns false when task is not a string', () => {
      expect(isMasterAgentDecision({ decision: 'accept', task: 123 })).toBe(false);
      expect(isMasterAgentDecision({ decision: 'reject', task: { nested: 'object' } })).toBe(false);
      expect(isMasterAgentDecision({ decision: 'accept', task: null })).toBe(false);
    });
  });

  describe('formatMasterAgentResponse', () => {
    it('formats valid accept JSON', () => {
      const result = formatMasterAgentResponse('{"decision":"accept"}');
      expect(result).toBe('Decision: accept');
    });

    it('formats valid reject JSON with task', () => {
      const result = formatMasterAgentResponse('{"decision":"reject","task":"fix the bug"}');
      expect(result).toContain('Decision: reject');
      expect(result).toContain('Task: fix the bug');
    });

    it('formats valid reject JSON without task', () => {
      const result = formatMasterAgentResponse('{"decision":"reject"}');
      expect(result).toBe('Decision: reject');
    });

    it('returns raw response for invalid JSON', () => {
      const raw = 'not valid json';
      expect(formatMasterAgentResponse(raw)).toBe(raw);
    });

    it('returns raw response for JSON with wrong shape', () => {
      const raw = '{"foo":"bar"}';
      expect(formatMasterAgentResponse(raw)).toBe(raw);
    });

    it('returns raw response for JSON with invalid decision', () => {
      const raw = '{"decision":"maybe"}';
      expect(formatMasterAgentResponse(raw)).toBe(raw);
    });

    it('returns raw response for empty string', () => {
      expect(formatMasterAgentResponse('')).toBe('');
    });

    it('returns raw response for JSON array', () => {
      const raw = '[1, 2, 3]';
      expect(formatMasterAgentResponse(raw)).toBe(raw);
    });
  });

  describe('formatCodingAgentResponse', () => {
    it('returns the response unchanged', () => {
      expect(formatCodingAgentResponse('test response')).toBe('test response');
    });

    it('handles empty string', () => {
      expect(formatCodingAgentResponse('')).toBe('');
    });

    it('handles multi-line response', () => {
      const multiLine = 'line 1\nline 2\nline 3';
      expect(formatCodingAgentResponse(multiLine)).toBe(multiLine);
    });

    it('handles response with special characters', () => {
      const special = 'Code: `const x = 1;` and ```typescript\nconst y = 2;\n```';
      expect(formatCodingAgentResponse(special)).toBe(special);
    });
  });
});
