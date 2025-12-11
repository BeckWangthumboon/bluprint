import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { initGitRepo, runGit } from '../../../helpers/tempRepo.js';
import { resetRepoRootCache } from '../../../helpers/gitCache.js';

import { codebaseIndexer } from '../../../../src/lib/codebase/index.js';
let repoRoot: string;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(async () => {
  resetRepoRootCache();
  repoRoot = await initGitRepo('main');
  originalEnv = { ...process.env };
});

afterEach(() => {
  Object.keys(process.env).forEach((key) => {
    delete process.env[key];
  });
  Object.assign(process.env, originalEnv);
});

describe('fileDiscovery', () => {
  describe('discoverFiles', () => {
    it('discovers all tracked files in the repository', async () => {
      const srcFile = path.join(repoRoot, 'src', 'index.ts');
      const readmeFile = path.join(repoRoot, 'README.md');

      await mkdir(path.dirname(srcFile), { recursive: true });
      await writeFile(srcFile, 'export {};', 'utf8');
      await writeFile(readmeFile, '# Test', 'utf8');
      await runGit(repoRoot, ['add', '.']);
      await runGit(repoRoot, ['commit', '-m', 'Add files']);

      process.env.GIT_DIR = path.join(repoRoot, '.git');
      process.env.GIT_WORK_TREE = repoRoot;
      resetRepoRootCache();

      const result = await codebaseIndexer.fileDiscovery.discoverFiles();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain('src/index.ts');
        expect(result.value).toContain('README.md');
      }
    });

    it('excludes binary image files', async () => {
      const tsFile = path.join(repoRoot, 'src', 'app.ts');
      const pngFile = path.join(repoRoot, 'assets', 'logo.png');
      const jpgFile = path.join(repoRoot, 'assets', 'photo.jpg');

      await mkdir(path.dirname(tsFile), { recursive: true });
      await mkdir(path.dirname(pngFile), { recursive: true });
      await writeFile(tsFile, 'export {};', 'utf8');
      await writeFile(pngFile, 'fake png data', 'utf8');
      await writeFile(jpgFile, 'fake jpg data', 'utf8');
      await runGit(repoRoot, ['add', '.']);
      await runGit(repoRoot, ['commit', '-m', 'Add files']);

      process.env.GIT_DIR = path.join(repoRoot, '.git');
      process.env.GIT_WORK_TREE = repoRoot;
      resetRepoRootCache();

      const result = await codebaseIndexer.fileDiscovery.discoverFiles();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain('src/app.ts');
        expect(result.value).not.toContain('assets/logo.png');
        expect(result.value).not.toContain('assets/photo.jpg');
      }
    });

    it('excludes binary video and audio files', async () => {
      const tsFile = path.join(repoRoot, 'index.ts');
      const mp4File = path.join(repoRoot, 'video.mp4');
      const mp3File = path.join(repoRoot, 'audio.mp3');

      await writeFile(tsFile, 'export {};', 'utf8');
      await writeFile(mp4File, 'fake video', 'utf8');
      await writeFile(mp3File, 'fake audio', 'utf8');
      await runGit(repoRoot, ['add', '.']);
      await runGit(repoRoot, ['commit', '-m', 'Add files']);

      process.env.GIT_DIR = path.join(repoRoot, '.git');
      process.env.GIT_WORK_TREE = repoRoot;
      resetRepoRootCache();

      const result = await codebaseIndexer.fileDiscovery.discoverFiles();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain('index.ts');
        expect(result.value).not.toContain('video.mp4');
        expect(result.value).not.toContain('audio.mp3');
      }
    });

    it('excludes archive and executable files', async () => {
      const tsFile = path.join(repoRoot, 'src.ts');
      const zipFile = path.join(repoRoot, 'archive.zip');
      const binFile = path.join(repoRoot, 'app.bin');

      await writeFile(tsFile, 'export {};', 'utf8');
      await writeFile(zipFile, 'fake zip', 'utf8');
      await writeFile(binFile, 'fake binary', 'utf8');
      await runGit(repoRoot, ['add', '.']);
      await runGit(repoRoot, ['commit', '-m', 'Add files']);

      process.env.GIT_DIR = path.join(repoRoot, '.git');
      process.env.GIT_WORK_TREE = repoRoot;
      resetRepoRootCache();

      const result = await codebaseIndexer.fileDiscovery.discoverFiles();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain('src.ts');
        expect(result.value).not.toContain('archive.zip');
        expect(result.value).not.toContain('app.bin');
      }
    });

    it('filters files by target directory', async () => {
      const srcFile = path.join(repoRoot, 'src', 'index.ts');
      const testFile = path.join(repoRoot, 'test', 'test.ts');
      const rootFile = path.join(repoRoot, 'README.md');

      await mkdir(path.dirname(srcFile), { recursive: true });
      await mkdir(path.dirname(testFile), { recursive: true });
      await writeFile(srcFile, 'export {};', 'utf8');
      await writeFile(testFile, 'test', 'utf8');
      await writeFile(rootFile, '# Test', 'utf8');
      await runGit(repoRoot, ['add', '.']);
      await runGit(repoRoot, ['commit', '-m', 'Add files']);

      process.env.GIT_DIR = path.join(repoRoot, '.git');
      process.env.GIT_WORK_TREE = repoRoot;
      resetRepoRootCache();

      const result = await codebaseIndexer.fileDiscovery.discoverFiles('src');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain('src/index.ts');
        expect(result.value).not.toContain('test/test.ts');
        expect(result.value).not.toContain('README.md');
      }
    });

    it('respects gitignore rules', async () => {
      const trackedFile = path.join(repoRoot, 'tracked.ts');
      const ignoredFile = path.join(repoRoot, 'ignored.log');
      const gitignorePath = path.join(repoRoot, '.gitignore');

      await writeFile(gitignorePath, '*.log\n', 'utf8');
      await writeFile(trackedFile, 'export {};', 'utf8');
      await writeFile(ignoredFile, 'should be ignored', 'utf8');
      await runGit(repoRoot, ['add', '.gitignore', 'tracked.ts']);
      await runGit(repoRoot, ['commit', '-m', 'Add files']);

      process.env.GIT_DIR = path.join(repoRoot, '.git');
      process.env.GIT_WORK_TREE = repoRoot;
      resetRepoRootCache();

      const result = await codebaseIndexer.fileDiscovery.discoverFiles();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain('tracked.ts');
        expect(result.value).not.toContain('ignored.log');
      }
    });
  });
});
