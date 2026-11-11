import type { LedgerRow, Violation } from "@/lib/types";

export type StatRow = Pick<
  LedgerRow,
  "id" | "agent_name" | "campaign" | "subject" | "recipient_email" | "status" | "delivered_at" | "created_at" | "score" | "violations" | "has_block" | "evaluated_at" | "event_type"
>;

export interface Breakdown {
  key: string;
  messages: number;
  avgScore: number | null;
  violations: number;
  blocked: number;
}

export interface Stats {
  complianceScore: number | null; // average eval score
  passRate: number | null; // % evaluated with no violations and score ≥ threshold
  evaluated: number;
  sent: number;
  blocked: number;
  flagged: number;
  pending: number;
  topRules: { rule: string; check: Violation["check"]; severity: Violation["severity"]; count: number }[];
  byAgent: Breakdown[];
  byCampaign: Breakdown[];
  trend: { day: string; avgScore: number | null; messages: number }[];
  feed: { messageId: string; subject: string | null; recipient: string; agent: string; at: string; violation: Violation }[];
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

function breakdown(rows: StatRow[], key: (r: StatRow) => string): Breakdown[] {
  const groups = new Map<string, StatRow[]>();
  for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  return Array.from(groups, ([k, rs]) => ({
    key: k,
    messages: rs.length,
    avgScore: avg(rs.flatMap((r) => (r.score == null ? [] : [r.score]))),
    violations: rs.reduce((n, r) => n + (r.violations?.length ?? 0), 0),
    blocked: rs.filter((r) => r.has_block).length,
  })).sort((a, b) => b.violations - a.violations || b.messages - a.messages);
}

/** Pure aggregation over ledger rows already filtered to the window. */
export function computeStats(rows: StatRow[], threshold: number, opts: { days: number; now?: Date; tz?: string } = { days: 30 }): Stats {
  const outbound = rows.filter((r) => r.event_type !== "reply.received");
  const evaluated = outbound.filter((r) => r.score != null);
  const ruleCounts = new Map<string, Stats["topRules"][number]>();
  for (const r of evaluated)
    for (const v of r.violations ?? []) {
      const k = `${v.check}::${v.rule}`;
      const cur = ruleCounts.get(k) ?? { rule: v.rule, check: v.check, severity: v.severity, count: 0 };
      cur.count++;
      if (v.severity === "block") cur.severity = "block";
      ruleCounts.set(k, cur);
    }

  const now = opts.now ?? new Date();
  const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: opts.tz }); // yyyy-mm-dd
  const trend: Stats["trend"] = [];
  for (let i = opts.days - 1; i >= 0; i--) {
    const day = dayKey(new Date(now.getTime() - i * 86400_000).toISOString());
    const rs = evaluated.filter((r) => dayKey(r.created_at) === day);
    trend.push({ day, avgScore: avg(rs.map((r) => r.score!)), messages: rs.length });
  }

  const feed = evaluated
    .flatMap((r) => (r.violations ?? []).map((v) => ({ messageId: r.id, subject: r.subject, recipient: r.recipient_email, agent: r.agent_name, at: r.evaluated_at ?? r.created_at, violation: v })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 25);

  return {
    complianceScore: avg(evaluated.map((r) => r.score!)),
    passRate: evaluated.length ? Math.round((100 * evaluated.filter((r) => !r.violations?.length && r.score! >= threshold).length) / evaluated.length) : null,
    evaluated: evaluated.length,
    sent: outbound.filter((r) => r.delivered_at).length,
    blocked: evaluated.filter((r) => r.has_block).length,
    flagged: evaluated.filter((r) => !r.has_block && (r.score! < threshold || (r.violations?.length ?? 0) > 0)).length,
    pending: outbound.filter((r) => r.status === "pending").length,
    topRules: Array.from(ruleCounts.values()).sort((a, b) => b.count - a.count).slice(0, 5),
    byAgent: breakdown(outbound, (r) => r.agent_name),
    byCampaign: breakdown(outbound, (r) => r.campaign ?? "(none)"),
    trend,
    feed,
  };
}

export const STAT_COLUMNS = "id, agent_name, campaign, subject, recipient_email, status, delivered_at, created_at, score, violations, has_block, evaluated_at, event_type";
