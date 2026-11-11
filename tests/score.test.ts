import { describe, expect, it } from "vitest";
import { combineEval, routeStatus, VIOLATION_SCORE_CAP } from "@/lib/judge/score";
import { scoreContent } from "@/lib/evaluate";
import type { Judge } from "@/lib/judge/types";
import { CLEAN_EMAIL, HALLUCINATION_EMAIL, PLANTED_SENTENCE, POLICIES, ctx } from "./fixtures";

const clean = {
  factsPolicy: { hallucination_score: 100, policy_score: 100, violations: [] },
  regulatoryPii: { regulatory_score: 100, pii_score: 100, violations: [] },
};

describe("combineEval", () => {
  it("overall score is the lowest of the four checks", () => {
    const r = combineEval({
      factsPolicy: { hallucination_score: 95, policy_score: 88, violations: [] },
      regulatoryPii: { regulatory_score: 91, pii_score: 99, violations: [] },
      policies: POLICIES,
      doNotContact: false,
      recipientEmail: "a@b.c",
    });
    expect(r.score).toBe(88);
    expect(r.has_block).toBe(false);
  });

  it("caps a check with violations below passing even if the judge scored it high", () => {
    const r = combineEval({
      ...clean,
      factsPolicy: {
        hallucination_score: 90,
        policy_score: 100,
        violations: [{ check: "hallucination", rule: "Unverified customer", offending_sentence: "x", explanation: "y" }],
      },
      policies: POLICIES,
      doNotContact: false,
      recipientEmail: "a@b.c",
    });
    expect(r.hallucination_score).toBe(VIOLATION_SCORE_CAP);
    expect(r.score).toBeLessThan(80);
  });

  it("policy violations inherit the rule's severity (by id or by text)", () => {
    const r = combineEval({
      ...clean,
      factsPolicy: {
        hallucination_score: 100,
        policy_score: 40,
        violations: [
          { check: "policy", rule: "pricing", rule_id: "P1", offending_sentence: "It's $99/mo.", explanation: "" },
          { check: "policy", rule: "Never mention a competitor by name.", rule_id: null, offending_sentence: "Unlike A2X…", explanation: "" },
        ],
      },
      policies: POLICIES,
      doNotContact: false,
      recipientEmail: "a@b.c",
    });
    expect(r.violations.map((v) => v.severity)).toEqual(["block", "flag"]);
    expect(r.violations[0].rule).toBe(POLICIES[0].rule_text);
    expect(r.has_block).toBe(true);
  });

  it("do-not-contact recipient is an instant block with regulatory score 0", () => {
    const r = combineEval({ ...clean, policies: POLICIES, doNotContact: true, recipientEmail: "dnc@x.y" });
    expect(r.has_block).toBe(true);
    expect(r.regulatory_score).toBe(0);
    expect(routeStatus(r, 80)).toBe("blocked");
  });

  it("PII leaks are block severity", () => {
    const r = combineEval({
      factsPolicy: clean.factsPolicy,
      regulatoryPii: { regulatory_score: 100, pii_score: 20, violations: [{ check: "pii", rule: "Other prospect's data", offending_sentence: "Like John at 555-0100", explanation: "" }] },
      policies: POLICIES,
      doNotContact: false,
      recipientEmail: "a@b.c",
    });
    expect(r.has_block).toBe(true);
  });
});

describe("routeStatus", () => {
  it("routes below-threshold to the queue, block to blocked, clean to sent", () => {
    expect(routeStatus({ score: 79, has_block: false, violations: [] }, 80)).toBe("flagged");
    expect(routeStatus({ score: 100, has_block: true, violations: [] }, 80)).toBe("blocked");
    expect(routeStatus({ score: 100, has_block: false, violations: [] }, 80)).toBe("sent");
  });
});

describe("scoreContent pipeline with a stubbed judge", () => {
  it("planted hallucination lands in the queue with the exact sentence cited", async () => {
    const judge: Judge = {
      model: "stub",
      factsPolicy: async () => ({
        hallucination_score: 30,
        policy_score: 100,
        violations: [{ check: "hallucination", rule: "Unverified customer claim", offending_sentence: PLANTED_SENTENCE, explanation: "Gymshark is forbidden", fact_sheet_line: "- Never claim Allbirds or Gymshark as customers." }],
      }),
      regulatoryPii: async () => clean.regulatoryPii,
    };
    const r = await scoreContent(judge, ctx(), HALLUCINATION_EMAIL);
    expect(r.score).toBeLessThan(80);
    expect(routeStatus(r, 80)).toBe("flagged");
    expect(r.violations[0].offending_sentence).toBe(PLANTED_SENTENCE);
    expect(HALLUCINATION_EMAIL.body).toContain(r.violations[0].offending_sentence);
  });

  it("passes the fact-sheet version and do-not-contact status to the judge", async () => {
    const seen: Record<string, unknown> = {};
    const judge: Judge = {
      model: "stub",
      factsPolicy: async (i) => ((seen.version = i.factSheetVersion), clean.factsPolicy),
      regulatoryPii: async (i) => ((seen.consent = i.consentStatus), clean.regulatoryPii),
    };
    const r = await scoreContent(judge, ctx({ doNotContact: true }), CLEAN_EMAIL);
    expect(seen).toEqual({ version: 3, consent: "do_not_contact" });
    expect(r.has_block).toBe(true);
  });
});
