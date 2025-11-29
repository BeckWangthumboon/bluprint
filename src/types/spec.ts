type Overview = {
  summary: string;
  goals?: string[];
};

type Motivation = {
  problem?: string;
  context?: string[];
};

type Constraints = string[];

type Guidelines = string[];

type ImplementationExample = {
  description: string;
  path: string;
};

type ImplementationPatterns = {
  guidelines?: Guidelines;
  examples?: ImplementationExample[];
};

type AcceptanceCriteria = string[];

type EdgeCase = {
  name: string;
  result: string;
  handling: string;
};

type EdgeCases = EdgeCase[];

type Scope = {
  include: string[];
  exclude?: string[];
};

type RuleReference = {
  name: string;
  path: string;
};

type Rules = RuleReference[];

type Specification = {
  overview: Overview;
  motivation?: Motivation;
  constraints?: Constraints;
  implementation_patterns?: ImplementationPatterns;
  acceptance_criteria: AcceptanceCriteria;
  edge_cases?: EdgeCases;
  scope: Scope;
  rules?: Rules;
};

export type {
  Overview,
  Motivation,
  Constraints,
  Guidelines,
  ImplementationExample,
  ImplementationPatterns,
  AcceptanceCriteria,
  EdgeCase,
  EdgeCases,
  Scope,
  RuleReference,
  Rules,
  Specification,
};
