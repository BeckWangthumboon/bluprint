import { createOpencode } from '@opencode-ai/sdk';
import { ResultAsync } from 'neverthrow';
import { getLogger } from './logger.js';
import type { OpencodeClient } from '@opencode-ai/sdk';

type Opencode = Awaited<ReturnType<typeof createOpencode>>;

let opencode: Opencode | null = null;

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export const isOpencodeInitialized = (): boolean => opencode !== null;

/**
 * Subscribe to SDK events and log them to debug.log
 */
const subscribeToEvents = (client: OpencodeClient): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(client.event.subscribe(), toError).andThen((events) =>
    ResultAsync.fromPromise(
      (async () => {
        for await (const event of events.stream) {
          const logger = getLogger();
          logger.debug('SDK_EVENT', {
            type: event.type,
            properties: event.properties,
          });
        }
      })(),
      toError
    )
  );

export const getOpencode = async (): Promise<Opencode> => {
  if (!opencode) {
    const result = await ResultAsync.fromPromise(createOpencode({ port: 4096 }), toError);

    if (result.isOk()) {
      opencode = result.value;
    } else {
      opencode = await createOpencode({ port: 0 });
    }
    subscribeToEvents(opencode.client).mapErr(() => {});
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
