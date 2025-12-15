import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ProviderV2, LanguageModelV2 } from '@ai-sdk/provider';

const createOpenRouterMock = vi.fn();
const createOpenAICompatibleMock = vi.fn();
const createVertexMock = vi.fn();
const createProviderRegistryMock = vi.fn();

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: (...args: unknown[]) => createOpenRouterMock(...args),
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: (...args: unknown[]) => createOpenAICompatibleMock(...args),
}));

vi.mock('@ai-sdk/google-vertex', () => ({
  createVertex: (...args: unknown[]) => createVertexMock(...args),
}));

vi.mock('ai', () => ({
  createProviderRegistry: (...args: unknown[]) => createProviderRegistryMock(...args),
}));

const stubLanguageModel = (modelId: string): LanguageModelV2 =>
  ({ id: modelId }) as unknown as LanguageModelV2;

const stubTextEmbeddingModel = (modelId: string): any =>
  ({ id: modelId, specificationVersion: 'v2', provider: 'test', modelId }) as any;

const stubImageModel = (modelId: string): any =>
  ({ id: modelId, specificationVersion: 'v2', provider: 'test', modelId }) as any;

const defaultProviderRegistry = {
  languageModel: vi.fn((modelId: string) => stubLanguageModel(modelId)),
};

const importGetModel = async () => (await import('../../../../src/agent/llm/registry.js')).getModel;

describe('getModel', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear all provider-related env vars
    delete process.env.PROVIDER;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ZAI_API_KEY;
    vi.clearAllMocks();

    const mockProvider = {
      id: 'openrouter-provider',
      languageModel: vi.fn((modelId: string) => stubLanguageModel(modelId)),
      textEmbeddingModel: vi.fn((modelId: string) => stubTextEmbeddingModel(modelId)),
      imageModel: vi.fn((modelId: string) => stubImageModel(modelId)),
    } as unknown as ProviderV2;

    const mockZaiProvider = {
      id: 'zai-provider',
      languageModel: vi.fn((modelId: string) => stubLanguageModel(modelId)),
      textEmbeddingModel: vi.fn((modelId: string) => stubTextEmbeddingModel(modelId)),
      imageModel: vi.fn((modelId: string) => stubImageModel(modelId)),
    } as unknown as ProviderV2;

    const mockVertexProvider = {
      id: 'vertex-provider',
      languageModel: vi.fn((modelId: string) => stubLanguageModel(modelId)),
      textEmbeddingModel: vi.fn((modelId: string) => stubTextEmbeddingModel(modelId)),
      imageModel: vi.fn((modelId: string) => stubImageModel(modelId)),
    } as unknown as ProviderV2;

    createOpenRouterMock.mockReturnValue(mockProvider);
    createOpenAICompatibleMock.mockReturnValue(mockZaiProvider);
    createVertexMock.mockReturnValue(mockVertexProvider);
    createProviderRegistryMock.mockReturnValue(defaultProviderRegistry);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns default openrouter model when PROVIDER is unset', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const getModel = await importGetModel();

    const result = getModel();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const model = result.value;
      expect(model).toEqual(stubLanguageModel('openrouter:amazon/nova-2-lite-v1:free'));
    }
  });

  it('returns validation error for unsupported provider value', async () => {
    process.env.PROVIDER = 'unsupported';
    const getModel = await importGetModel();

    const result = getModel();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('Unsupported provider');
    }
  });

  it('returns an error when API key for selected provider is missing', async () => {
    process.env.PROVIDER = 'openrouter';
    delete process.env.OPENROUTER_API_KEY;
    const getModel = await importGetModel();

    const result = getModel();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('LLM_ERROR');
      expect(result.error.message).toContain('Missing API key');
    }
  });

  it('returns an error when provider construction fails', async () => {
    process.env.OPENROUTER_API_KEY = 'present';
    createOpenRouterMock.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const getModel = await importGetModel();

    const result = getModel();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('LLM_ERROR');
      expect(result.error.message).toContain('configure provider openrouter');
    }
  });

  it('returns an error when registry cannot provide the model', async () => {
    process.env.OPENROUTER_API_KEY = 'present';
    createProviderRegistryMock.mockReturnValueOnce({
      languageModel: vi.fn(() => {
        throw new Error('missing model');
      }),
    });
    const getModel = await importGetModel();

    const result = getModel();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('LLM_ERROR');
      expect(result.error.message).toContain('Model openrouter:amazon/nova-2-lite-v1:free');
    }
  });

  it('returns vertex model when PROVIDER=vertex without requiring API key', async () => {
    process.env.PROVIDER = 'vertex';
    const getModel = await importGetModel();

    const result = getModel();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const model = result.value;
      expect(model).toEqual(stubLanguageModel('vertex:gemini-2.5-flash'));
    }
    expect(createVertexMock).toHaveBeenCalledTimes(1);
    expect(createVertexMock).toHaveBeenCalledWith({});
  });

  it('returns an error when vertex provider construction fails', async () => {
    process.env.PROVIDER = 'vertex';
    createVertexMock.mockImplementationOnce(() => {
      throw new Error('vertex config failed');
    });
    const getModel = await importGetModel();

    const result = getModel();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('LLM_ERROR');
      expect(result.error.message).toContain('configure provider vertex');
    }
  });
});
