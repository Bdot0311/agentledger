import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DIGEST_WRITER_PROMPT } from "@/lib/judge/prompts";
import { JUDGE_MODEL } from "@/lib/judge/claude";
import { computeStats, STAT_COLUMNS, type StatRow, type Stats } from "@/lib/stats";
import { deliverEmail, senderAddress } from "@/lib/send";
import { appUrl } from "@/lib/utils";
import type { Workspace } from "@/lib/types";

/** True when it's Monday 8:00–8:59 in the workspace's timezone. */
export function isDigestHour(timezone: string, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "numeric", hour12: false }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  return weekday === "Mon" && hour === 8;
}

const FIX_BY_CHECK: Record<string, string> = {
  hallucination: "add the claim to the fact sheet if it's true, otherwise remove it from the prompt/template",
  policy: "rewrite the template or prompt so the agent can't produce it, or add the missing facts to the fact sheet",
  regulatory: "add an unsubscribe line (and postal address) to the template footer and sync your do-not-contact list",
  pii: "stop injecting other prospects' records into the prompt context; scope personalization data per recipient",
};

export function topFixes(stats: Stats): string[] {
  return stats.topRules.slice(0, 3).map((r) => `Rule '${r.rule}' fired ${r.count} time${r.count === 1 ? "" : "s"} — ${FIX_BY_CHECK[r.check] ?? "review the template"}.`);
}

export function digestStatsPayload(workspace: Pick<Workspace, "name" | "eval_threshold">, stats: Stats) {
  return {
    workspace: workspace.name,
    window: "last 7 days",
    compliance_score: stats.complianceScore,
    pass_rate_percent: stats.passRate,
    threshold: workspace.eval_threshold,
    messages_sent: stats.sent,
    messages_blocked: stats.blocked,
    messages_flagged: stats.flagged,
    messages_evaluated: stats.evaluated,
    top_violated_rules: stats.topRules.slice(0, 3).map((r) => ({ rule: r.rule, check: r.check, severity: r.severity, count: r.count })),
    suggested_fixes: topFixes(stats),
    worst_agents: stats.byAgent.filter((a) => a.violations > 0).slice(0, 3),
  };
}

/** Deterministic fallback used when the LLM is unavailable. */
export function fallbackDigest(p: ReturnType<typeof digestStatsPayload>): string {
  const lines = [
    `# AgentLedger weekly briefing — ${p.workspace}`,
    "",
    `**Compliance score:** ${p.compliance_score ?? "–"} (threshold ${p.threshold})`,
    `**Messages:** ${p.messages_sent} sent · ${p.messages_blocked} blocked · ${p.messages_flagged} flagged`,
    "",
    "## Top violated rules",
    ...(p.top_violated_rules.length ? p.top_violated_rules.map((r, i) => `${i + 1}. ${r.rule} — ${r.count}×\n   Fix: ${p.suggested_fixes[i]}`) : ["None this week."]),
    "",
    `**Highest-leverage fix this week:** ${p.suggested_fixes[0] ?? "Nothing urgent — keep the fact sheet current."}`,
  ];
  return lines.join("\n");
}

export async function writeDigest(payload: ReturnType<typeof digestStatsPayload>): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackDigest(payload);
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.beta.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 4000,
      system: DIGEST_WRITER_PROMPT,
      messages: [{ role: "user", content: `<weekly_stats>\n${JSON.stringify(payload, null, 2)}\n</weekly_stats>` }],
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (res.stop_reason === "refusal") return fallbackDigest(payload);
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    return text || fallbackDigest(payload);
  } catch {
    return fallbackDigest(payload);
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Tiny markdown → HTML for the email (headings, bold, lists, paragraphs). */
export function markdownToHtml(md: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => list && (out.push(`</${list}>`), (list = null));
  for (const raw of md.split("\n")) {
    const line = escapeHtml(raw).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>");
    const h = line.match(/^(#{1,3})\s+(.*)/);
    const ul = line.match(/^\s*[-*]\s+(.*)/);
    const ol = line.match(/^\s*\d+\.\s+(.*)/);
    if (h) (close(), out.push(`<h${h[1].length + 1}>${h[2]}</h${h[1].length + 1}>`));
    else if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      if (list !== kind) (close(), out.push(`<${kind}>`), (list = kind));
      out.push(`<li>${(ul ?? ol)![1]}</li>`);
    } else if (!line.trim()) close();
    else (close(), out.push(`<p>${line}</p>`));
  }
  close();
  return `<div style="font-family:system-ui,sans-serif;max-width:600px">${out.join("")}</div>`;
}

export async function runDigestForWorkspace(db: SupabaseClient, workspace: Workspace, now = new Date()) {
  const since = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const { data } = await db.from("message_ledger").select(STAT_COLUMNS).eq("workspace_id", workspace.id).gte("created_at", since).limit(10000);
  const rows = (data ?? []) as unknown as StatRow[];
  if (!rows.filter((r) => r.event_type !== "reply.received").length) return { skipped: "no messages this week" as const };

  const stats = computeStats(rows, workspace.eval_threshold, { days: 7, now, tz: workspace.timezone });
  const payload = digestStatsPayload(workspace, stats);
  const markdown = await writeDigest(payload);

  let to = workspace.digest_email;
  if (!to) {
    const { data: owner } = await db.auth.admin.getUserById(workspace.owner_id);
    to = owner.user?.email ?? null;
  }
  if (!to) return { skipped: "no digest recipient" as const };

  const footer = `\n\n—\nOpen the queue: ${appUrl("/app/queue")}`;
  const sent = await deliverEmail({
    from: senderAddress(process.env.RESEND_FROM || workspace.from_email),
    to,
    subject: `AgentLedger weekly: score ${stats.complianceScore ?? "–"} · ${stats.blocked} blocked · ${stats.flagged} flagged`,
    body: markdown + footer,
    html: markdownToHtml(markdown + footer),
  });
  await db.from("digest_runs").insert({
    workspace_id: workspace.id,
    sent_at: now.toISOString(),
    messages_sent: stats.sent,
    messages_blocked: stats.blocked,
    avg_score: stats.complianceScore,
  });
  return { sent: sent.id, to, markdown };
}
