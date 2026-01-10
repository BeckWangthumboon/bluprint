import { ResultAsync, ok } from 'neverthrow';
import { exec } from '../shell.js';

/**
 * Slugifies a string for use in branch names.
 * Converts to lowercase, replaces non-alphanumeric chars with dashes,
 * and truncates to the specified max length.
 *
 * @param title - The string to slugify
 * @param maxLength - Maximum length of the slug (default 50)
 * @returns A branch-safe slug
 */
const slugify = (title: string, maxLength = 50): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, maxLength)
    .replace(/-+$/, '');
};

/**
 * Generates a stacked branch name from the base branch, step number, and title.
 *
 * @param baseBranch - The base branch name (e.g., "add-dark-mode")
 * @param stepNumber - The plan step number
 * @param title - The plan step title
 * @returns The full branch name (e.g., "add-dark-mode/1-add-config-schema")
 */
const generateBranchName = (baseBranch: string, stepNumber: number, title: string): string => {
  const slug = slugify(title);
  return `${baseBranch}/${stepNumber}-${slug}`;
};

/**
 * Checks if the Graphite CLI (gt) is available on the system.
 *
 * @returns ResultAsync resolving to true if available, false otherwise
 */
const isGraphiteAvailable = (): ResultAsync<boolean, Error> => {
  return exec('gt', ['--version'])
    .map(() => true)
    .orElse(() => ok(false));
};

/**
 * Gets the current git branch name.
 *
 * @returns ResultAsync resolving to the current branch name
 */
const getBaseBranch = (): ResultAsync<string, Error> => {
  return exec('git', ['rev-parse', '--abbrev-ref', 'HEAD']).map((result) => result.stdout.trim());
};

/**
 * Creates a new stacked branch using Graphite CLI.
 * Uses `gt create <name>` which automatically tracks the parent branch.
 *
 * @param branchName - The name of the branch to create
 * @returns ResultAsync resolving to void on success
 */
const createStackedBranch = (branchName: string): ResultAsync<void, Error> => {
  return exec('gt', ['create', branchName])
    .map(() => undefined)
    .mapErr(
      (error) => new Error(`Failed to create stacked branch '${branchName}': ${error.message}`)
    );
};

/**
 * Creates a stacked branch for a plan step.
 * Generates the branch name from base branch, step number, and title,
 * then creates it via Graphite CLI.
 *
 * @param baseBranch - The base branch name
 * @param stepNumber - The plan step number
 * @param title - The plan step title
 * @returns ResultAsync resolving to the created branch name, or an error
 */
const createStackedBranchForStep = (
  baseBranch: string,
  stepNumber: number,
  title: string
): ResultAsync<string, Error> => {
  const branchName = generateBranchName(baseBranch, stepNumber, title);
  return createStackedBranch(branchName).map(() => branchName);
};

export const graphite = {
  slugify,
  generateBranchName,
  isGraphiteAvailable,
  getBaseBranch,
  createStackedBranch,
  createStackedBranchForStep,
};
