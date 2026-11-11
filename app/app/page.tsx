import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace";
import { computeStats, STAT_COLUMNS, type Breakdown, type StatRow } from "@/lib/stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendChart } from "@/components/trend-chart";
import { fmtDate } from "@/lib/format";

function BreakdownTable({ title, rows, threshold }: { title: string; rows: Breakdown[]; threshold: number }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="pb-1">Name</th><th>Msgs</th><th>Avg</th><th>Violations</th><th>Blocked</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((r) => (
              <tr key={r.key} className="border-t">
                <td className="py-1">{r.key}</td>
                <td>{r.messages}</td>
                <td className={r.avgScore != null && r.avgScore < threshold ? "text-destructive" : ""}>{r.avgScore ?? "–"}</td>
                <td>{r.violations}</td>
                <td>{r.blocked}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="py-2 text-muted-foreground">No data yet.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export default async function Dashboard() {
  const { workspace } = await requireWorkspace();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data } = await createClient()
    .from("message_ledger")
    .select(STAT_COLUMNS)
    .eq("workspace_id", workspace.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  const s = computeStats((data ?? []) as unknown as StatRow[], workspace.eval_threshold, { days: 30, tz: workspace.timezone });
  const t = workspace.eval_threshold;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Trailing 30 days</p>
        </div>
        {s.pending > 0 && <Badge variant="outline">{s.pending} awaiting eval</Badge>}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-6 pt-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Sent / Blocked / Flagged</div>
            <div className="text-4xl font-bold tabular-nums">
              {s.sent} <span className="text-muted-foreground">/</span> <span className="text-red-600">{s.blocked}</span> <span className="text-muted-foreground">/</span>{" "}
              <span className="text-amber-600">{s.flagged}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Compliance score</div>
            <div className={`text-4xl font-bold tabular-nums ${s.complianceScore != null && s.complianceScore < t ? "text-destructive" : ""}`}>{s.complianceScore ?? "–"}</div>
            <div className="text-xs text-muted-foreground">{s.passRate != null ? `${s.passRate}% of ${s.evaluated} evaluated passed clean` : "no evals yet"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Score trend</CardTitle></CardHeader>
        <CardContent><TrendChart data={s.trend} threshold={t} /></CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Violation feed</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {s.feed.map((f, i) => (
                <li key={i} className="border-b pb-2 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={f.violation.severity === "block" ? "destructive" : "warning"}>{f.violation.severity}</Badge>
                    <span className="font-medium">{f.violation.rule}</span>
                  </div>
                  <p className="mt-1 italic text-muted-foreground">“{f.violation.offending_sentence}”</p>
                  <p className="text-xs text-muted-foreground">
                    <Link href={`/app/log/${f.messageId}`} className="underline">{f.subject || "(no subject)"}</Link> → {f.recipient} · {f.agent} · {fmtDate(f.at, workspace.timezone)}
                  </p>
                </li>
              ))}
              {!s.feed.length && <li className="text-muted-foreground">No violations in the last 30 days.</li>}
            </ul>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Top violated rules</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-1 text-sm">
                {s.topRules.map((r) => (
                  <li key={r.check + r.rule} className="flex items-center justify-between gap-2">
                    <span><Badge variant="outline" className="mr-2">{r.check}</Badge>{r.rule}</span>
                    <span className="tabular-nums font-semibold">{r.count}×</span>
                  </li>
                ))}
                {!s.topRules.length && <li className="text-muted-foreground">Nothing yet.</li>}
              </ol>
            </CardContent>
          </Card>
          <BreakdownTable title="By agent" rows={s.byAgent} threshold={t} />
          <BreakdownTable title="By campaign" rows={s.byCampaign} threshold={t} />
        </div>
      </div>
    </div>
  );
}
