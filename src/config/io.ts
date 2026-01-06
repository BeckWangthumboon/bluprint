import { ResultAsync, ok, err } from 'neverthrow';
import { z } from 'zod';
import type { BluprintConfig, ModelsConfig, ModelConfig } from './schemas.js';
import type { ConfigValidationError } from './types.js';
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

export const readBluprintConfig = (): ResultAsync<BluprintConfig, ConfigValidationError> => {
  const filePath = getConfigFilePath(BLUPRINT_CONFIG_FILE);

  return fsUtils
    .fileExists(filePath)
    .mapErr(
      (e): ConfigValidationError => ({
        type: 'CONFIG_FILE_INVALID_JSON',
        file: filePath,
        message: e.message,
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
            type: 'CONFIG_FILE_INVALID_JSON',
            file: filePath,
            message: e.message,
          })
        )
        .andThen((content) => {
          let json: unknown;
          try {
            json = JSON.parse(content);
          } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            return err({
              type: 'CONFIG_FILE_INVALID_JSON',
              file: filePath,
              message: error.message,
            } as const);
          }

          const result = BluprintConfigSchema.safeParse(json);

          if (!result.success) {
            const errorMessage =
              result.error instanceof z.ZodError
                ? result.error.issues.map((issue) => issue.message).join('; ')
                : 'Unknown validation error';
            return err({
              type: 'CONFIG_SCHEMA_INVALID',
              file: filePath,
              message: errorMessage,
            } as const);
          }

          return ok(result.data);
        });
    });
};

export const writeBluprintConfig = (config: BluprintConfig): ResultAsync<void, Error> => {
  const filePath = getConfigFilePath(BLUPRINT_CONFIG_FILE);
  const content = JSON.stringify(config, null, 2);
  return fsUtils.writeFile(filePath, content);
};

export const readModelsConfig = (): ResultAsync<ModelsConfig, ConfigValidationError> => {
  const filePath = getConfigFilePath(MODELS_CONFIG_FILE);

  return fsUtils
    .fileExists(filePath)
    .mapErr(
      (e): ConfigValidationError => ({
        type: 'CONFIG_FILE_INVALID_JSON',
        file: filePath,
        message: e.message,
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
            type: 'CONFIG_FILE_INVALID_JSON',
            file: filePath,
            message: e.message,
          })
        )
        .andThen((content) => {
          let json: unknown;
          try {
            json = JSON.parse(content);
          } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            return err({
              type: 'CONFIG_FILE_INVALID_JSON',
              file: filePath,
              message: error.message,
            } as const);
          }

          const result = ModelsConfigSchema.safeParse(json);

          if (!result.success) {
            const errorMessage =
              result.error instanceof z.ZodError
                ? result.error.issues.map((issue) => issue.message).join('; ')
                : 'Unknown validation error';
            return err({
              type: 'CONFIG_SCHEMA_INVALID',
              file: filePath,
              message: errorMessage,
            } as const);
          }

          return ok(result.data);
        });
    });
};

export const writeModelsConfig = (config: ModelsConfig): ResultAsync<void, Error> => {
  const filePath = getConfigFilePath(MODELS_CONFIG_FILE);
  const content = JSON.stringify(config, null, 2);
  return fsUtils.writeFile(filePath, content);
};

export const modelConfigEquals = (a: ModelConfig, b: ModelConfig): boolean => {
  return a.providerID === b.providerID && a.modelID === b.modelID;
};

export const formatModelConfig = (model: ModelConfig): string => {
  return `${model.providerID}/${model.modelID}`;
};
