import { createToolRegistry } from './types.js';
import { lookupRulesTool } from './lookupRules.js';
import { viewFileTool } from './viewFile.js';

const toolRegistry = createToolRegistry([lookupRulesTool, viewFileTool]);

export { toolRegistry };
