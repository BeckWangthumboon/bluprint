import { ResultAsync, err, ok } from 'neverthrow';
import { getOpencodeClient } from './session.js';
import { toError, getOpenCodeError } from './utils.js';
import { getLogger } from './logger.js';
import type { Session as SDKSession } from '@opencode-ai/sdk';

type OpencodeClient = Awaited<ReturnType<typeof getOpencodeClient>>;

interface Session {
  id: string;
  client: OpencodeClient;
}

const createSession = (title: string): ResultAsync<Session, Error> =>
  ResultAsync.fromPromise(getOpencodeClient(), toError).andThen((client) =>
    ResultAsync.fromPromise(client.session.create({ body: { title } }), toError).andThen(
      (response) => {
        const error = getOpenCodeError(response, 'Failed to create session');
        if (error) return err(error);
        if (!response.data) {
          return err(new Error('Failed to create session: No data returned'));
        }
        return ResultAsync.fromSafePromise(Promise.resolve({ id: response.data.id, client }));
      }
    )
  );

/**
 * Fetch the full session data from the SDK
 */
const getSession = (session: Session): ResultAsync<SDKSession, Error> =>
  ResultAsync.fromPromise(
    session.client.session.get({ path: { id: session.id } }),
    toError
  ).andThen((response) => {
    const error = getOpenCodeError(response, 'Failed to get session');
    if (error) return err(error);
    if (!response.data) {
      return err(new Error('Failed to get session: No data returned'));
    }
    return ok(response.data);
  });

/**
 * Fetch session messages from the SDK
 */
const getSessionMessages = (session: Session): ResultAsync<unknown[], Error> =>
  ResultAsync.fromPromise(
    session.client.session.messages({ path: { id: session.id } }),
    toError
  ).andThen((response) => {
    const error = getOpenCodeError(response, 'Failed to get session messages');
    if (error) return err(error);
    return ok(response.data ?? []);
  });

/**
 * Fetch session data and messages, combining them into a single object
 */
const getSessionWithMessages = (
  session: Session
): ResultAsync<SDKSession & { messages: unknown[] }, Error> =>
  ResultAsync.combine([getSession(session), getSessionMessages(session)]).map(
    ([sessionData, messages]) => ({
      ...sessionData,
      messages,
    })
  );

interface SessionMeta {
  agent: string;
  iteration?: number;
}

/**
 * Safely log session data, catching both sync and async errors
 */
const logSession = (
  sessionId: string,
  sessionData: SDKSession & { messages: unknown[] },
  meta: SessionMeta
): ResultAsync<void, Error> =>
  ResultAsync.fromThrowable(async () => {
    const logger = getLogger();
    await logger.logSession(sessionId, sessionData, meta);
  }, toError)();

/**
 * Log the session data and then delete the session.
 * Currently deletion is commented out for debugging - sessions will persist in OpenCode UI.
 */
const deleteSession = (session: Session, meta: SessionMeta): ResultAsync<void, Error> =>
  getSessionWithMessages(session)
    .andThen((sessionData) => logSession(session.id, sessionData, meta))
    .orElse((error) => {
      console.warn(`[sessionManager] Failed to log session ${session.id}: ${error.message}`);
      return ok(undefined);
    })
    .andThen(() => {
      // TODO: Uncomment when done debugging
      // return ResultAsync.fromPromise(
      //   session.client.session.delete({ path: { id: session.id } }),
      //   toError
      // ).andThen((response) => {
      //   const error = getOpenCodeError(response, 'Failed to delete session');
      //   if (error) return err(error);
      //   return ok();
      // });
      return ok(undefined);
    });

export type { OpencodeClient, Session };
export { createSession, getSession, deleteSession };
