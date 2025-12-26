import { createOpencode } from '@opencode-ai/sdk';

type Opencode = Awaited<ReturnType<typeof createOpencode>>;

let opencode: Opencode | null = null;

export const isOpencodeInitialized = (): boolean => opencode !== null;

export const getOpencode = async (): Promise<Opencode> => {
  if (!opencode) {
    try {
      opencode = await createOpencode({ port: 4096 });
    } catch {
      opencode = await createOpencode({ port: 0 });
    }
  }
  return opencode;
};

export const getOpencodeClient = async () => {
  const instance = await getOpencode();
  return instance.client;
};

export const getOpencodeServer = async () => {
  const instance = await getOpencode();
  return instance.server;
};
