import { fileDiscovery } from './discover.js';
import { fileDescriber } from './describe.js';
import { codebaseIndexer as indexer } from './build.js';

export const codebaseIndexer = {
  fileDiscovery,
  fileDescriber,
  indexer,
};
