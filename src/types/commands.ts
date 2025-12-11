interface InitArgs {
  spec: string;
  base: string;
}

interface RulesArgs {
  rulesSource: 'embedded' | 'directory';
  rulesEmbeddedFile?: string;
  rulesDir?: string;
  json?: boolean;
}

interface PlanArgs {
  json?: boolean;
}

interface IndexArgs {
  json?: boolean;
  directory?: string;
}

export type { InitArgs, RulesArgs, PlanArgs, IndexArgs };
