import path from 'path';
import { ResultAsync } from 'neverthrow';
import { gitUtils } from '../git.js';
import { type AppError } from '../../types/errors.js';

// Binary and non-text file extensions that should not be indexed.
const HARD_EXCLUDED_EXTENSIONS = new Set([
  // Images
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'tiff',
  'tif',
  'webp',
  'ico',
  'svg',
  'psd',
  'apng',
  'avif',
  // Video
  'mp4',
  'mkv',
  'avi',
  'mov',
  'wmv',
  'flv',
  'webm',
  'm4v',
  'mpg',
  'mpeg',
  'vob',
  'avchd',
  // Audio
  'mp3',
  'wav',
  'flac',
  'aac',
  'ogg',
  'wma',
  'm4a',
  'aiff',
  'ape',
  // Documents
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  // Archives
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'bz2',
  'xz',
  'iso',
  'dmg',
  'pkg',
  'deb',
  'rpm',
  // Executables/Binary
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  'dat',
  'class',
  'o',
  'pyc',
  'pyo',
  'wasm',
  // Database
  'db',
  'sqlite',
  'mdb',
  'accdb',
  // Other Binary
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',
]);

/**
 * Discovers all files within the workspace or a specific directory, respecting gitignore rules
 * and excluding binary/non-text files.
 *
 * @param targetDir - Optional directory to limit file discovery; defaults to entire repo.
 * @returns ResultAsync containing deduplicated repo-relative file paths; AppError when git fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const discoverFiles = (targetDir?: string): ResultAsync<string[], AppError> => {
  const scanRoot = targetDir ?? '.';

  return gitUtils.gitListTrackedFiles(scanRoot).map((files) => {
    const filteredFiles = files.filter((file) => {
      const ext = path.extname(file).slice(1).toLowerCase();
      return !HARD_EXCLUDED_EXTENSIONS.has(ext);
    });

    const seen = new Set<string>();
    const deduped: string[] = [];

    filteredFiles.forEach((file) => {
      if (seen.has(file)) return;
      seen.add(file);
      deduped.push(file);
    });

    return deduped;
  });
};

export const fileDiscovery = {
  discoverFiles,
};
