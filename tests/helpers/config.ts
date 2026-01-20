import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { BluprintConfig, ModelsConfig } from '../../src/config/index.js';

const getConfigDir = (cwd: string): string => join(cwd, '.bluprint', 'config');

const getModelsConfigPath = (cwd: string): string => join(getConfigDir(cwd), 'models.json');

const getBluprintConfigPath = (cwd: string): string =>
  join(getConfigDir(cwd), 'bluprint.config.json');

/**
 * Writes a JSON file, creating parent directories as needed.
 *
 * @param filePath - Absolute file path to write.
 * @param data - JSON-serializable data.
 * @returns Promise that resolves when the file is written.
 */
const writeJsonFile = async (filePath: string, data: unknown): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2));
};

/**
 * Reads and parses a JSON file.
 *
 * @param filePath - Absolute file path to read.
 * @returns Parsed JSON data.
 */
const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const contents = await readFile(filePath, 'utf8');
  return JSON.parse(contents) as T;
};

/**
 * Writes the models config file in the given workspace.
 *
 * @param cwd - Workspace root.
 * @param config - Models config content.
 * @returns Promise that resolves when the file is written.
 */
const writeModelsConfig = async (cwd: string, config: ModelsConfig): Promise<void> => {
  await writeJsonFile(getModelsConfigPath(cwd), config);
};

/**
 * Writes the bluprint config file in the given workspace.
 *
 * @param cwd - Workspace root.
 * @param config - Bluprint config content.
 * @returns Promise that resolves when the file is written.
 */
const writeBluprintConfig = async (cwd: string, config: BluprintConfig): Promise<void> => {
  await writeJsonFile(getBluprintConfigPath(cwd), config);
};

export {
  getBluprintConfigPath,
  getConfigDir,
  getModelsConfigPath,
  readJsonFile,
  writeBluprintConfig,
  writeModelsConfig,
  writeJsonFile,
};
