import { getOpencodeServer, isOpencodeInitialized } from './agent/opencodesdk.js';

const globalController = new AbortController();

/**
 * Triggers the global abort signal.
 */
export function globalAbort(): void {
  if (!globalController.signal.aborted) {
    console.log('Shutting down...');
    globalController.abort();
  }
}

/**
 * Get the global abort signal.
 */
export function getAbortSignal(): AbortSignal {
  return globalController.signal;
}

/**
 * Check if abort has been requested.
 */
export function isAborted(): boolean {
  return globalController.signal.aborted;
}

let isExiting = false;

/**
 * Manages global exit logic for the application.
 *
 * Provides mechanisms to initiate process shutdown, handle abort signals,
 * and perform orderly cleanup of Opencode server resources if initialized.
 *
 */

export async function exit(code: number = 0): Promise<never> {
  if (isExiting) {
    process.exit(code);
  }
  isExiting = true;

  globalAbort();

  if (isOpencodeInitialized()) {
    try {
      const server = await getOpencodeServer();
      server.close();
    } catch {}
  }
  process.exit(code);
}
