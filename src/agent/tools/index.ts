import { createToolRegistry } from './types.js';
import { lookupRulesTool } from './lookupRules.js';

const toolRegistry = createToolRegistry([lookupRulesTool]);

export { toolRegistry };
