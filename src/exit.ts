import { getOpencodeServer } from './agent/session.js';

export async function exit(code: number = 0): Promise<never> {
  const server = await getOpencodeServer();
  server.close();
  process.exit(code);
}
