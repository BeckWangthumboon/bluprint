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

export type { InitArgs, RulesArgs };
