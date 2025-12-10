import { errAsync, ResultAsync } from 'neverthrow';
import type { PlanArgs } from '../types/commands.js';
import type { SuccessInfo } from '../lib/exit.js';
import { workspaceSpecUtils } from '../lib/workspace/spec.js';
import { workspaceRules } from '../lib/workspace/rules.js';
import { workspacePlan } from '../lib/workspace/plan.js';
import { planAgent } from '../agent/agents/planAgent.js';
import type { AppError } from '../types/errors.js';

/**
 * Generates an execution plan from the workspace specification using the plan agent.
 *
 * Flow: Loads config, specification, and rules index.
 * Invokes the plan agent to generate tasks from the spec.
 * Writes the generated plan to the workspace.
 *
 * @param args - CLI args containing optional json flag for output formatting.
 * @returns ResultAsync containing success info on plan generation, or AppError when validation or generation fails.
 * @throws Never throws. Errors flow via AppError in ResultAsync.
 */
const plan = (args: PlanArgs): ResultAsync<SuccessInfo, AppError> =>
  workspaceSpecUtils.loadWorkspaceSpec().andThen((spec) =>
    workspaceRules.loadRulesIndex().andThen((rulesIndex) => {
      const planAgentResult = planAgent.createPlanAgent();
      if (planAgentResult.isErr()) return errAsync(planAgentResult.error);

      return planAgentResult
        .value({ spec, rulesIndex })
        .andThen((generatedPlan) => workspacePlan.writePlan(generatedPlan).map(() => generatedPlan))
        .map((generatedPlan) => ({
          command: 'plan',
          message: `Generated plan with ${generatedPlan.tasks.length} task(s).`,
          details: args.json ? undefined : generatedPlan.tasks.map((t) => t.title),
        }));
    }),
  );

export { plan };
