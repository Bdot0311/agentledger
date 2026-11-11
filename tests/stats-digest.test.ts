import { describe, expect, it } from "vitest";
import { computeStats, type StatRow } from "@/lib/stats";
import { digestStatsPayload, fallbackDigest, isDigestHour, markdownToHtml, topFixes } from "@/lib/digest";
import type { Violation } from "@/lib/types";

const pricing: Violation = { check: "policy", rule: "never promise pricing", offending_sentence: "$49", explanation: "", severity: "block" };
const halluc: Violation = { check: "hallucination", rule: "Unverified customer claim", offending_sentence: "Gymshark uses us", explanation: "", severity: "flag" };

const row = (o: Partial<StatRow>): StatRow => ({
  id: Math.random().toString(),
  agent_name: "bot-a",
  campaign: "q4",
  subject: "s",
  recipient_email: "x@y.z",
  status: "sent",
  delivered_at: "2026-11-09T12:00:00Z",
  created_at: "2026-11-09T12:00:00Z",
  score: 100,
  violations: [],
  has_block: false,
  evaluated_at: "2026-11-09T12:05:00Z",
  event_type: "message.sent",
  ...o,
});

describe("computeStats", () => {
  const rows = [
    row({}),
    row({ score: 40, violations: [pricing], has_block: true, status: "blocked", delivered_at: null }),
    row({ score: 60, violations: [halluc], status: "flagged", agent_name: "bot-b" }),
    row({ score: 50, violations: [pricing, halluc], has_block: true, status: "blocked", delivered_at: null }),
    row({ score: null, violations: null, has_block: null, status: "pending", evaluated_at: null }),
    row({ event_type: "reply.received", status: "received", score: null }),
  ];
  const s = computeStats(rows, 80, { days: 7, now: new Date("2026-11-11T12:00:00Z"), tz: "UTC" });

  it("counts sent / blocked / flagged", () => {
    expect(s.sent).toBe(3);
    expect(s.blocked).toBe(2);
    expect(s.flagged).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.evaluated).toBe(4);
  });
  it("compliance score is the mean eval score; pass rate counts clean messages", () => {
    expect(s.complianceScore).toBe(63); // (100+40+60+50)/4 = 62.5 → 63
    expect(s.passRate).toBe(25);
  });
  it("ranks top violated rules and breaks down by agent", () => {
    expect(s.topRules.map((r) => [r.rule, r.count])).toEqual([
      ["never promise pricing", 2],
      ["Unverified customer claim", 2],
    ]);
    expect(s.byAgent.find((a) => a.key === "bot-b")).toMatchObject({ messages: 1, violations: 1, avgScore: 60 });
  });
  it("produces one trend point per day", () => {
    expect(s.trend).toHaveLength(7);
    expect(s.trend.find((d) => d.day === "2026-11-09")?.messages).toBe(4);
  });

  it("digest fixes name the rule and count", () => {
    expect(topFixes(s)[0]).toMatch(/^Rule 'never promise pricing' fired 2 times — /);
    const md = fallbackDigest(digestStatsPayload({ name: "Acme", eval_threshold: 80 }, s));
    expect(md).toContain("3 sent · 2 blocked · 1 flagged");
    expect(markdownToHtml(md)).toContain("<h2>");
  });
});

describe("isDigestHour", () => {
  it("is Monday 8am local time", () => {
    expect(isDigestHour("America/New_York", new Date("2026-11-09T13:30:00Z"))).toBe(true); // Mon 8:30 EST
    expect(isDigestHour("America/New_York", new Date("2026-11-09T12:30:00Z"))).toBe(false); // Mon 7:30
    expect(isDigestHour("Asia/Tokyo", new Date("2026-11-08T23:10:00Z"))).toBe(true); // Mon 8:10 JST
    expect(isDigestHour("UTC", new Date("2026-11-10T08:00:00Z"))).toBe(false); // Tuesday
  });
});
