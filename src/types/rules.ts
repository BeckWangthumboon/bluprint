export type RuleReference = {
  id: string;
  description: string;
  path: string;
  tags: string[];
};

export type RulesIndex = { rules: RuleReference[] };
