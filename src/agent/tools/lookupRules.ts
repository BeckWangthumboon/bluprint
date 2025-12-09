import { workspaceRules } from '../../lib/workspace/rules.js';
import { makeTool } from './types.js';
import { z } from 'zod';
import { errAsync, ok, type ResultAsync } from 'neverthrow';
import type { RuleReference } from '../../types/rules.js';
import { createToolError, mapAppErrorToToolError, type ToolError } from './errors.js';

const { loadRulesIndex } = workspaceRules;

/**
 * Loads workspace rules index to return a rule by id without throwing.
 *
 * @param ruleId - Rule identifier to resolve from the workspace rules index.
 * @returns ResultAsync containing the matching RuleReference or a ToolError when missing or IO failures occur.
 */
const lookupRules = (ruleId: string): ResultAsync<RuleReference, ToolError> =>
  loadRulesIndex()
    .mapErr(mapAppErrorToToolError)
    .andThen((rulesIndex) => {
      const rule = rulesIndex.rules.find((candidate) => candidate.id === ruleId);
      if (!rule) {
        return errAsync(createToolError('NOT_FOUND', `Rule ${ruleId} not found`, { ruleId }));
      }
      return ok(rule);
    });

const lookupRulesTool = makeTool({
  name: 'lookupRules',
  description: 'Lookup rules',
  inputSchema: z.object({
    ruleId: z.string(),
  }),
  handler: ({ ruleId }) => lookupRules(ruleId),
});

export { lookupRulesTool };
