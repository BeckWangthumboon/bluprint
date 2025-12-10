import { describe, it, expect } from 'vitest';
import { planAgent } from '../../../src/agent/agents/planAgent.js';
import type { Specification } from '../../../src/types/spec.js';

describe('planAgent', () => {
  describe('generateSpecId', () => {
    it('generates a deterministic ID from the same spec', () => {
      const spec: Specification = {
        overview: {
          summary: 'Test spec',
        },
        acceptance_criteria: ['Criterion 1'],
        scope: {
          include: ['src/**'],
        },
      };

      const id1 = planAgent.generateSpecId(spec);
      const id2 = planAgent.generateSpecId(spec);

      expect(id1).toBe(id2);
      expect(id1).toMatch(/^plan-[0-9a-f]+$/);
    });

    it('generates different IDs for different specs', () => {
      const spec1: Specification = {
        overview: {
          summary: 'Test spec 1',
        },
        acceptance_criteria: ['Criterion 1'],
        scope: {
          include: ['src/**'],
        },
      };

      const spec2: Specification = {
        overview: {
          summary: 'Test spec 2',
        },
        acceptance_criteria: ['Criterion 2'],
        scope: {
          include: ['lib/**'],
        },
      };

      const id1 = planAgent.generateSpecId(spec1);
      const id2 = planAgent.generateSpecId(spec2);

      expect(id1).not.toBe(id2);
    });
  });
});
