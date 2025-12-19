import { createOpencode } from '@opencode-ai/sdk';

type Opencode = Awaited<ReturnType<typeof createOpencode>>;

let opencode: Opencode | null = null;

export const getOpencode = async (): Promise<Opencode> => {
  if (!opencode) {
    opencode = await createOpencode({
      hostname: '127.0.0.1',
      port: 4096,
    });
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
