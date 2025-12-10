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

export type { InitArgs, RulesArgs, PlanArgs };
