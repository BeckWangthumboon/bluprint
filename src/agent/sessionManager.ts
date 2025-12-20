import { ResultAsync, err } from 'neverthrow';
import { getOpencodeClient } from './session.js';
import { toError } from './utils.js';

export type OpencodeClient = Awaited<ReturnType<typeof getOpencodeClient>>;

export interface Session {
  id: string;
  client: OpencodeClient;
}

export const createSession = (title: string): ResultAsync<Session, Error> =>
  ResultAsync.fromPromise(getOpencodeClient(), toError).andThen((client) =>
    ResultAsync.fromPromise(client.session.create({ body: { title } }), toError).andThen(
      (response) => {
        if (!response.data) {
          return err(new Error('Failed to create session: No data returned'));
        }
        return ResultAsync.fromSafePromise(Promise.resolve({ id: response.data.id, client }));
      }
    )
  );

export const deleteSession = (session: Session): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(session.client.session.delete({ path: { id: session.id } }), toError).map(
    () => undefined
  );
