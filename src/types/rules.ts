export type RuleReference = {
  id: string;
  name?: string;
  description: string;
  path: string;
};

export type RulesIndex = { rules: RuleReference[] };
