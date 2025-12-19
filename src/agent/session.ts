import { createOpencode } from '@opencode-ai/sdk';

const opencode = await createOpencode({
  hostname: '127.0.0.1',
  port: 4096,
});

const client = opencode.client;

export { client as opencodeClient };
