import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';
import { codebaseIndexer } from '../../../../src/lib/codebase/index.js';
import type { CodeSummarizer } from '../../../../src/agent/agents/codeSummarizer.js';
import type { AppError } from '../../../../src/types/errors.js';

vi.mock('../../../../src/lib/fs.js', () => ({
  fsUtils: {
    fsReadFile: vi.fn(),
  },
}));

const fsModule = await import('../../../../src/lib/fs.js');
const fsReadFileMock = fsModule.fsUtils.fsReadFile as unknown as ReturnType<typeof vi.fn>;
const { fileDescriber } = codebaseIndexer;

describe('fileDescriber.generateFileDescription', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('trims whitespace from LLM output', async () => {
    const summarizer: CodeSummarizer = () => okAsync('  This file contains utility functions.  \n');
    fsReadFileMock.mockReturnValue(okAsync('export const utility = () => {};'));

    const result = await fileDescriber.generateFileDescription('src/utils.ts', summarizer);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe('This file contains utility functions.');
      expect(result.value.startsWith(' ')).toBe(false);
      expect(result.value.endsWith(' ')).toBe(false);
      expect(result.value.endsWith('\n')).toBe(false);
    }
  });

  it('slices output at 200 characters', async () => {
    const longText =
      'This is a very long description that exceeds the 200 character limit. ' +
      'It contains multiple sentences and goes on and on with detailed information ' +
      'about the file contents. This should be cut off at exactly 200 characters ' +
      'to keep descriptions concise and readable in the index.';
    const summarizer: CodeSummarizer = () => okAsync(longText);
    fsReadFileMock.mockReturnValue(okAsync('export const app = {};'));

    const result = await fileDescriber.generateFileDescription('src/app.ts', summarizer);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBeLessThanOrEqual(200);
      expect(result.value).toBe(longText.slice(0, 200));
    }
  });

  it('trims before slicing to maximize useful content', async () => {
    const textWithWhitespace = '    ' + 'A'.repeat(180) + '    ' + 'B'.repeat(50); // 180 As + whitespace + 50 Bs
    const summarizer: CodeSummarizer = () => okAsync(textWithWhitespace);
    fsReadFileMock.mockReturnValue(okAsync('export {};'));

    const result = await fileDescriber.generateFileDescription('test.ts', summarizer);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Should trim first, removing leading spaces, then slice
      expect(result.value).not.toMatch(/^\s+/);
      expect(result.value.length).toBeLessThanOrEqual(200);
      expect(result.value.startsWith('AAAA')).toBe(true);
    }
  });

  it('handles short descriptions without modification', async () => {
    const shortText = 'Simple utility file.';
    const summarizer: CodeSummarizer = () => okAsync(shortText);
    fsReadFileMock.mockReturnValue(okAsync('export {};'));

    const result = await fileDescriber.generateFileDescription('utils.ts', summarizer);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(shortText);
    }
  });

  it('returns empty string when file read fails', async () => {
    const error: AppError = { code: 'FS_NOT_FOUND', message: 'File not found' };
    const summarizer: CodeSummarizer = () => okAsync('Should not be called');
    fsReadFileMock.mockReturnValue(errAsync(error));

    const result = await fileDescriber.generateFileDescription('missing.ts', summarizer);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe('');
    }
  });

  it('returns empty string when summarizer fails', async () => {
    const error: AppError = { code: 'LLM_ERROR', message: 'Model error' };
    const summarizer: CodeSummarizer = () => errAsync(error);
    fsReadFileMock.mockReturnValue(okAsync('export {};'));

    const result = await fileDescriber.generateFileDescription('test.ts', summarizer);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe('');
    }
  });

  it('handles empty string from summarizer', async () => {
    const summarizer: CodeSummarizer = () => okAsync('');
    fsReadFileMock.mockReturnValue(okAsync('export {};'));

    const result = await fileDescriber.generateFileDescription('empty.ts', summarizer);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe('');
    }
  });

  it('handles whitespace-only output from summarizer', async () => {
    const summarizer: CodeSummarizer = () => okAsync('   \n  \t  ');
    fsReadFileMock.mockReturnValue(okAsync('export {};'));

    const result = await fileDescriber.generateFileDescription('blank.ts', summarizer);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // After trim, whitespace-only becomes empty string
      expect(result.value).toBe('');
    }
  });
});
