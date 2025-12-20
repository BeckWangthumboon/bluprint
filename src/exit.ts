import { getOpencodeServer, isOpencodeInitialized } from './agent/session.js';

export async function exit(code: number = 0): Promise<never> {
  if (isOpencodeInitialized()) {
    const server = await getOpencodeServer();
    server.close();
  }
  process.exit(code);
}
