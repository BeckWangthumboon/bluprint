import { ResultAsync, errAsync } from 'neverthrow';

export type PlanStepHeader = {
  stepNumber: number;
  title: string;
};

type ExtractPlanOutlineOptions = {
  currentStep: number;
  range: number;
};

/**
 * Extracts plan step headers from plan content.
 *
 * @param planContent - Full plan.md content
 * @param options - Optional filtering options
 *   - currentStep: Center the extraction around this step
 *   - range: Number of steps before/after currentStep to include
 *   If no options provided, returns ALL step headers.
 * @returns Array of step headers sorted by step number
 */
export const extractPlanOutline = (
  planContent: string,
  options?: ExtractPlanOutlineOptions
): PlanStepHeader[] => {
  // Match step headers in the format: "## N Title"
  const headerRegex = /^## (\d+) (.+)$/gm;
  const headers: PlanStepHeader[] = [];

  const allMatches = planContent.matchAll(headerRegex);
  for (const match of allMatches) {
    const stepNumber = parseInt(match[1]!, 10);
    const title = match[2]!.trim();
    headers.push({ stepNumber, title });
  }
  headers.sort((a, b) => a.stepNumber - b.stepNumber);

  if (!options) {
    return headers;
  }

  const { currentStep, range } = options;
  const minStep = currentStep - range;
  const maxStep = currentStep + range;
  return headers.filter((h) => h.stepNumber >= minStep && h.stepNumber <= maxStep);
};

/**
 * Formats a plan step header for display.
 * @param header - The step header to format
 * @returns Formatted string like "1. Project Initialization"
 */
export const formatStepHeader = (header: PlanStepHeader): string =>
  `${header.stepNumber}. ${header.title}`;

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
