import type { CheckName, MessageStatus, Policy, Severity, Violation } from "@/lib/types";
import type { FactsPolicyOutput, RegulatoryPiiOutput } from "./schema";

/** A check that has at least one violation can never score at or above this. */
export const VIOLATION_SCORE_CAP = 69;

export const DEFAULT_SEVERITY: Record<CheckName, Severity> = {
  hallucination: "flag",
  policy: "flag", // overridden by the rule's own severity
  regulatory: "flag",
  pii: "block", // leaking another prospect's data must never send
};

export interface CombinedEval {
  score: number;
  hallucination_score: number;
  policy_score: number;
  regulatory_score: number;
  pii_score: number;
  violations: Violation[];
  has_block: boolean;
}

const CHECKS: CheckName[] = ["hallucination", "policy", "regulatory", "pii"];
const asCheck = (c: string, fallback: CheckName): CheckName => (CHECKS.includes(c as CheckName) ? (c as CheckName) : fallback);

function matchPolicy(policies: Pick<Policy, "rule_text" | "severity">[], ruleId: string | null | undefined, rule: string) {
  const idx = ruleId?.match(/^P(\d+)$/i)?.[1];
  if (idx && policies[Number(idx) - 1]) return policies[Number(idx) - 1];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return policies.find((p) => norm(p.rule_text) === norm(rule) || norm(rule).includes(norm(p.rule_text)) || norm(p.rule_text).includes(norm(rule)));
}

/**
 * Deterministic aggregation of the two judge passes.
 * - overall score = lowest of the four checks
 * - a check with violations is capped below passing
 * - policy violations inherit their rule's severity; do-not-contact is always block
 */
export function combineEval(args: {
  factsPolicy: FactsPolicyOutput;
  regulatoryPii: RegulatoryPiiOutput;
  policies: Pick<Policy, "rule_text" | "severity">[];
  doNotContact: boolean;
  recipientEmail: string;
}): CombinedEval {
  const violations: Violation[] = [];

  for (const v of args.factsPolicy.violations) {
    const check = asCheck(v.check, "hallucination") === "policy" ? "policy" : "hallucination";
    let severity = DEFAULT_SEVERITY[check];
    let rule = v.rule;
    if (check === "policy") {
      const p = matchPolicy(args.policies, v.rule_id, v.rule);
      severity = p?.severity ?? "flag";
      rule = p?.rule_text ?? v.rule;
    }
    violations.push({ check, rule, offending_sentence: v.offending_sentence, explanation: v.explanation, severity, fact_sheet_line: v.fact_sheet_line ?? null });
  }
  for (const v of args.regulatoryPii.violations) {
    const check = asCheck(v.check, "regulatory") === "pii" ? "pii" : "regulatory";
    violations.push({ check, rule: v.rule, offending_sentence: v.offending_sentence, explanation: v.explanation, severity: DEFAULT_SEVERITY[check] });
  }

  if (args.doNotContact) {
    violations.unshift({
      check: "regulatory",
      rule: "Recipient is marked do-not-contact",
      offending_sentence: `To: ${args.recipientEmail}`,
      explanation: "This recipient is on the workspace do-not-contact list. Contacting them is an instant block.",
      severity: "block",
    });
  }
  // A do-not-contact recipient is a block even if the judge also reported it.
  if (args.doNotContact) {
    for (const v of violations) if (v.check === "regulatory" && /do.?not.?contact/i.test(v.rule + v.explanation)) v.severity = "block";
  }

  const has = (c: CheckName) => violations.some((v) => v.check === c);
  const cap = (s: number, c: CheckName) => (has(c) ? Math.min(s, VIOLATION_SCORE_CAP) : s);
  const hallucination_score = cap(args.factsPolicy.hallucination_score, "hallucination");
  const policy_score = cap(args.factsPolicy.policy_score, "policy");
  const regulatory_score = args.doNotContact ? 0 : cap(args.regulatoryPii.regulatory_score, "regulatory");
  const pii_score = cap(args.regulatoryPii.pii_score, "pii");

  return {
    score: Math.min(hallucination_score, policy_score, regulatory_score, pii_score),
    hallucination_score,
    policy_score,
    regulatory_score,
    pii_score,
    violations,
    has_block: violations.some((v) => v.severity === "block"),
  };
}

/**
 * Status after an eval. Block → blocked. Below threshold or any violation →
 * flagged (approval queue). Otherwise clean: `sent` for already-delivered
 * mail; drafts are released by the caller.
 */
export function routeStatus(e: Pick<CombinedEval, "score" | "has_block" | "violations">, threshold: number): Extract<MessageStatus, "blocked" | "flagged" | "sent"> {
  if (e.has_block) return "blocked";
  if (e.score < threshold || e.violations.length > 0) return "flagged";
  return "sent";
}
