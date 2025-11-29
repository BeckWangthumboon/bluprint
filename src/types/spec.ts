export type Overview = {
  summary: string;
  goals?: string[];
};

export type Motivation = {
  problem?: string;
  context?: string[];
};

export type Constraints = string[];

export type Guidelines = string[];

export type ImplementationExample = {
  description: string;
  path: string;
};

export type ImplementationPatterns = {
  guidelines?: Guidelines;
  examples?: ImplementationExample[];
};

export type AcceptanceCriteria = string[];

export type EdgeCase = {
  name: string;
  result: string;
  handling: string;
};

export type EdgeCases = EdgeCase[];

export type Scope = {
  include: string[];
  exclude?: string[];
};

export type RuleReference = {
  name: string;
  path: string;
};

export type Rules = RuleReference[];

export type Specification = {
  overview: Overview;
  motivation?: Motivation;
  constraints?: Constraints;
  implementation_patterns?: ImplementationPatterns;
  acceptance_criteria: AcceptanceCriteria;
  edge_cases?: EdgeCases;
  scope: Scope;
  rules?: Rules;
};
