import { ResultAsync, errAsync } from 'neverthrow';

type PlanStepMessages = {
  invalidStepNumber: (stepNumber: number) => string;
  missingStep: (stepNumber: number) => string;
  emptyStep: (stepNumber: number) => string;
};

const defaultMessages: PlanStepMessages = {
  invalidStepNumber: (stepNumber) =>
    `Invalid plan step number: ${stepNumber}. Must be a positive integer.`,
  missingStep: (stepNumber) => `Plan step ${stepNumber} not found in plan.md.`,
  emptyStep: (stepNumber) => `Plan step ${stepNumber} is empty.`,
};

export const findPlanStep = (planContent: string, stepNumber: number): string | null => {
  if (!Number.isInteger(stepNumber) || stepNumber < 1) {
    return null;
  }

  const stepRegex = new RegExp(`^## ${stepNumber} [\\s\\S]+?(?=^## \\d+ |$)`, 'm');
  const match = planContent.match(stepRegex);
  if (!match) {
    return null;
  }

  return match[0].trim();
};

export const getPlanStep = (
  planContent: string,
  stepNumber: number,
  messages: Partial<PlanStepMessages> = {}
): ResultAsync<string, Error> => {
  const resolvedMessages: PlanStepMessages = {
    ...defaultMessages,
    ...messages,
  };

  if (!Number.isInteger(stepNumber) || stepNumber < 1) {
    return errAsync(new Error(resolvedMessages.invalidStepNumber(stepNumber)));
  }

  const stepContent = findPlanStep(planContent, stepNumber);
  if (!stepContent) {
    return errAsync(new Error(resolvedMessages.missingStep(stepNumber)));
  }

  if (!stepContent.trim()) {
    return errAsync(new Error(resolvedMessages.emptyStep(stepNumber)));
  }

  return ResultAsync.fromSafePromise(Promise.resolve(stepContent));
};
