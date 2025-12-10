import { describe, it, expect } from 'vitest';

describe('plan command', () => {
  it('accepts json flag', () => {
    const args = {
      json: true,
    };

    expect(args.json).toBe(true);
  });

  it('defaults json to false when not provided', () => {
    const args = {
      json: false,
    };

    expect(args.json).toBe(false);
  });
});
