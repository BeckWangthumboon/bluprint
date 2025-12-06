import type { RuleReference } from './rules.js';

type TaskKind = 'feature' | 'refactor' | 'bugfix' | 'chore' | 'other';

interface TaskScope {
  files?: string[];
  includeGlobs?: string[];
  excludeGlobs?: string[];
}

interface TodoTask {
  id: string;
  title: string;
  instructions: string;
  kind?: TaskKind;
  scope: TaskScope;
  rules: RuleReference[];
  acceptanceCriteria: string[];
  dependencies?: string[];
}

interface Plan {
  id: string;
  summary?: string;
  notes?: string[];
  tasks: TodoTask[];
}

export type { TaskKind, TaskScope, TodoTask, Plan };
