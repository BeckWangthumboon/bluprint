import { z } from 'zod';

export const RuleReferenceSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  path: z.string().min(1),
  tags: z.array(z.string()),
});

export type RuleReference = z.infer<typeof RuleReferenceSchema>;

export type RulesIndex = { rules: RuleReference[] };

export type RuleSource = {
  path: string;
};
