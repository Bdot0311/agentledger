import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace";
import { applyLedgerFilters, parseLedgerFilters } from "@/lib/ledger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScoreBadge, StatusBadge } from "@/components/score";
import { fmtDate } from "@/lib/format";
import type { LedgerRow } from "@/lib/types";

const PAGE = 100;
const STATUSES = ["pending", "sent", "flagged", "blocked", "approved", "rejected", "received"];

export default async function LogPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { workspace } = await requireWorkspace();
  const db = createClient();
  const filters = parseLedgerFilters(searchParams);
  const page = Math.max(0, Number(searchParams.page ?? 0) || 0);

  const [{ data, count }, { data: agentRows }] = await Promise.all([
    applyLedgerFilters(db.from("message_ledger").select("*", { count: "exact" }).eq("workspace_id", workspace.id), filters)
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1),
    db.from("messages").select("agent_name").eq("workspace_id", workspace.id).limit(5000),
  ]);
  const rows = (data ?? []) as LedgerRow[];
  const agents = Array.from(new Set((agentRows ?? []).map((r) => r.agent_name as string))).sort();

  const qs = new URLSearchParams(Object.entries(searchParams).filter(([k, v]) => v && k !== "page") as [string, string][]);
  const exportHref = (format: string) => `/api/export?${new URLSearchParams([...Array.from(qs.entries()), ["format", format]])}`;
  const pageHref = (p: number) => `/app/log?${new URLSearchParams([...Array.from(qs.entries()), ["page", String(p)]])}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Audit log</h1>
          <p className="text-sm text-muted-foreground">Append-only. {count ?? 0} record(s) match.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><a href={exportHref("csv")}>Export CSV</a></Button>
          <Button asChild variant="outline" size="sm"><a href={exportHref("json")}>Export JSON</a></Button>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2 text-sm" method="get">
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">Agent</span>
          <select name="agent" defaultValue={filters.agent ?? ""} className="h-10 rounded-md border px-2">
            <option value="">All agents</option>
            {agents.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">Status</span>
          <select name="status" defaultValue={filters.status ?? ""} className="h-10 rounded-md border px-2">
            <option value="">Any</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">Score ≥</span>
          <Input name="min_score" type="number" min={0} max={100} defaultValue={filters.minScore} className="w-20" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">Score ≤</span>
          <Input name="max_score" type="number" min={0} max={100} defaultValue={filters.maxScore} className="w-20" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">From</span>
          <Input name="from" type="date" defaultValue={filters.from} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">To</span>
          <Input name="to" type="date" defaultValue={filters.to} />
        </label>
        <Button type="submit" size="sm">Filter</Button>
        <Button asChild variant="ghost" size="sm"><Link href="/app/log">Reset</Link></Button>
      </form>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">When</th>
              <th className="p-2">Agent</th>
              <th className="p-2">Recipient</th>
              <th className="p-2">Subject</th>
              <th className="p-2">Score</th>
              <th className="p-2">Status</th>
              <th className="p-2">Violations</th>
              <th className="p-2">Fact sheet</th>
              <th className="p-2">Decision</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="whitespace-nowrap p-2">{fmtDate(r.sent_at ?? r.created_at, workspace.timezone)}</td>
                <td className="p-2">{r.agent_name}</td>
                <td className="p-2">{r.recipient_email}</td>
                <td className="max-w-[240px] truncate p-2">
                  <Link href={`/app/log/${r.id}`} className="hover:underline">{r.subject || "(no subject)"}</Link>
                </td>
                <td className="p-2"><ScoreBadge score={r.score} threshold={workspace.eval_threshold} /></td>
                <td className="p-2"><StatusBadge status={r.status} /></td>
                <td className="p-2">{r.violations?.length ?? 0}</td>
                <td className="p-2">v{r.fact_sheet_version ?? "–"}</td>
                <td className="p-2 text-xs">{r.decision ? `${r.decision} · ${r.decided_by}` : "–"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No records.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        {page > 0 && <Button asChild variant="outline" size="sm"><Link href={pageHref(page - 1)}>← Newer</Link></Button>}
        {(count ?? 0) > (page + 1) * PAGE && <Button asChild variant="outline" size="sm"><Link href={pageHref(page + 1)}>Older →</Link></Button>}
      </div>
    </div>
  );
}
