import { z } from "zod";

const score = z.coerce.number().min(0).max(100).transform(Math.round);

const violation = z.object({
  check: z.string(),
  rule: z.string().default(""),
  rule_id: z.string().nullable().optional(),
  offending_sentence: z.string().default(""),
  explanation: z.string().default(""),
  fact_sheet_line: z.string().nullable().optional(),
});

export const factsPolicyOutput = z.object({
  hallucination_score: score,
  policy_score: score,
  violations: z.array(violation).default([]),
});
export type FactsPolicyOutput = z.infer<typeof factsPolicyOutput>;

export const regulatoryPiiOutput = z.object({
  regulatory_score: score,
  pii_score: score,
  violations: z.array(violation).default([]),
});
export type RegulatoryPiiOutput = z.infer<typeof regulatoryPiiOutput>;

const violationJson = (checks: string[], extra: Record<string, unknown> = {}) => ({
  type: "object",
  additionalProperties: false,
  required: ["check", "rule", "offending_sentence", "explanation", ...Object.keys(extra)],
  properties: {
    check: { type: "string", enum: checks },
    rule: { type: "string" },
    offending_sentence: { type: "string" },
    explanation: { type: "string" },
    ...extra,
  },
});

/** JSON schemas for `output_config.format` (structured outputs → always-valid JSON). */
export const FACTS_POLICY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hallucination_score", "policy_score", "violations"],
  properties: {
    hallucination_score: { type: "integer" },
    policy_score: { type: "integer" },
    violations: {
      type: "array",
      items: violationJson(["hallucination", "policy"], {
        rule_id: { type: ["string", "null"] },
        fact_sheet_line: { type: ["string", "null"] },
      }),
    },
  },
};

export const REGULATORY_PII_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["regulatory_score", "pii_score", "violations"],
  properties: {
    regulatory_score: { type: "integer" },
    pii_score: { type: "integer" },
    violations: { type: "array", items: violationJson(["regulatory", "pii"]) },
  },
};
