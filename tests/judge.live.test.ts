/**
 * Live judge tests against the Anthropic API. Run with:
 *   ANTHROPIC_API_KEY=… pnpm test tests/judge.live.test.ts
 * Skipped when no key is present (CI without secrets).
 */
import { describe, expect, it } from "vitest";
import { claudeJudge } from "@/lib/judge/claude";
import { routeStatus } from "@/lib/judge/score";
import { scoreContent } from "@/lib/evaluate";
import { CLEAN_EMAIL, HALLUCINATION_EMAIL, PLANTED_SENTENCE, ctx } from "./fixtures";

const live = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!live)("Claude judge (live)", () => {
  it("catches a planted customer hallucination, scores below threshold, cites the exact sentence", async () => {
    const r = await scoreContent(claudeJudge, ctx(), HALLUCINATION_EMAIL);
    expect(r.score).toBeLessThan(80);
    expect(routeStatus(r, 80)).not.toBe("sent");
    const hit = r.violations.find((v) => v.check === "hallucination" && v.offending_sentence.includes("Gymshark"));
    expect(hit, JSON.stringify(r.violations, null, 2)).toBeTruthy();
    expect(PLANTED_SENTENCE).toContain(hit!.offending_sentence.trim().replace(/^"|"$/g, ""));
  });

  it("passes a clean message: score 100, no violations", async () => {
    const r = await scoreContent(claudeJudge, ctx(), CLEAN_EMAIL);
    expect(r.violations, JSON.stringify(r.violations, null, 2)).toEqual([]);
    expect(r.score).toBe(100);
  });
});
