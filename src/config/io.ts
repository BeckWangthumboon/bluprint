import { ResultAsync, ok, err, errAsync, Result } from 'neverthrow';
import { z } from 'zod';
import type { BluprintConfig, ModelsConfig, ModelConfig } from './schemas.js';
import type { ConfigValidationError } from './errors.js';
import { fsUtils } from '../fs.js';
import * as path from 'path';
import { BluprintConfigSchema, ModelsConfigSchema } from './schemas.js';

const CONFIG_DIR = '.bluprint/config';
const BLUPRINT_CONFIG_FILE = 'bluprint.config.json';
const MODELS_CONFIG_FILE = 'models.json';

export const getConfigDir = (): string => {
  return path.resolve(process.cwd(), CONFIG_DIR);
};

export const getConfigFilePath = (filename: string): string => {
  return path.join(getConfigDir(), filename);
};

export const ensureConfigDir = (): ResultAsync<void, Error> => {
  return fsUtils.ensureDir(getConfigDir());
};

/**
 * Generic config file reader with Zod schema validation.
 */
const readConfigFile = <T>(
  filePath: string,
  schema: z.ZodType<T>
): ResultAsync<T, ConfigValidationError> => {
  return fsUtils
    .fileExists(filePath)
    .mapErr(
      (): ConfigValidationError => ({
        type: 'CONFIG_FILE_READ_ERROR',
        file: filePath,
        message: 'Failed to read file',
      })
    )
    .andThen((exists) => {
      if (!exists) {
        return err({ type: 'CONFIG_FILE_MISSING', file: filePath } as const);
      }
      return fsUtils
        .readFile(filePath)
        .mapErr(
          (e): ConfigValidationError => ({
            type: 'CONFIG_FILE_READ_ERROR',
            file: filePath,
            message: e.message,
          })
        )
        .andThen((content) => parseAndValidate(content, filePath, schema));
    });
};

/**
 * Generic config file writer with Zod schema validation.
 */
const writeConfigFile = <T>(
  filePath: string,
  schema: z.ZodType<T>,
  config: T
): ResultAsync<void, ConfigValidationError | Error> => {
  const parseResult = schema.safeParse(config);
  if (!parseResult.success) {
    return errAsync({
      type: 'CONFIG_SCHEMA_INVALID',
      file: filePath,
      message: parseResult.error.issues.map((i) => i.message).join('; '),
    });
  }

  const content = JSON.stringify(parseResult.data, null, 2);
  return fsUtils.writeFile(filePath, content);
};
/**
 * Parses JSON content and validates against a Zod schema.
 */
const parseAndValidate = <T>(
  content: string,
  filePath: string,
  schema: z.ZodType<T>
): Result<T, ConfigValidationError> => {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return err({
      type: 'CONFIG_FILE_INVALID_JSON',
      file: filePath,
      message: error.message,
    });
  }

  const result = schema.safeParse(json);

  if (!result.success) {
    return err({
      type: 'CONFIG_SCHEMA_INVALID',
      file: filePath,
      message: result.error.issues.map((issue) => issue.message).join('; '),
    });
  }

  return ok(result.data);
};

const readBluprintConfig = (): ResultAsync<BluprintConfig, ConfigValidationError> => {
  return readConfigFile(getConfigFilePath(BLUPRINT_CONFIG_FILE), BluprintConfigSchema);
};

const writeBluprintConfig = (
  config: BluprintConfig
): ResultAsync<void, ConfigValidationError | Error> => {
  return writeConfigFile(getConfigFilePath(BLUPRINT_CONFIG_FILE), BluprintConfigSchema, config);
};

const readModelsConfig = (): ResultAsync<ModelsConfig, ConfigValidationError> => {
  return readConfigFile(getConfigFilePath(MODELS_CONFIG_FILE), ModelsConfigSchema);
};

const writeModelsConfig = (
  config: ModelsConfig
): ResultAsync<void, ConfigValidationError | Error> => {
  return writeConfigFile(getConfigFilePath(MODELS_CONFIG_FILE), ModelsConfigSchema, config);
};

export const modelConfigEquals = (a: ModelConfig, b: ModelConfig): boolean => {
  return a.providerID === b.providerID && a.modelID === b.modelID;
};

export const formatModelConfig = (model: ModelConfig): string => {
  return `${model.providerID}/${model.modelID}`;
};

export const configUtils = {
  bluprint: {
    read: readBluprintConfig,
    write: writeBluprintConfig,
  },
  models: {
    read: readModelsConfig,
    write: writeModelsConfig,
  },
};
