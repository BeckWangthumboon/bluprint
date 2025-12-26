import { getOpencodeServer, isOpencodeInitialized } from './agent/session.js';

let isExiting = false;

export async function exit(code: number = 0): Promise<never> {
  if (isExiting) {
    process.exit(code);
  }
  isExiting = true;
  if (isOpencodeInitialized()) {
    try {
      const server = await getOpencodeServer();
      server.close();
    } catch {}
  }
  process.exit(code);
}
