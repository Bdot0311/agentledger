import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CheckScores, HighlightedBody, ScoreBadge, StatusBadge, ViolationList } from "@/components/score";
import { QueueActions } from "@/components/queue-actions";
import { fmtDate } from "@/lib/format";
import type { LedgerRow } from "@/lib/types";

export default async function QueuePage() {
  const { workspace } = await requireWorkspace();
  const { data } = await createClient()
    .from("message_ledger")
    .select("*")
    .eq("workspace_id", workspace.id)
    .in("status", ["blocked", "flagged"])
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as LedgerRow[];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Approval queue</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} message{rows.length === 1 ? "" : "s"} below {workspace.eval_threshold} or with a violation. Nothing here sends without your decision.
        </p>
      </div>
      {rows.length === 0 && (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">Queue is clear.</CardContent>
        </Card>
      )}
      {rows.map((m) => (
        <Card key={m.id} className={m.status === "blocked" ? "border-red-300" : "border-amber-300"}>
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={m.status} />
              <ScoreBadge score={m.score} threshold={workspace.eval_threshold} />
              <Link href={`/app/log/${m.id}`} className="font-medium hover:underline">
                {m.subject || "(no subject)"}
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              To {m.recipient_email} · {m.agent_name}
              {m.campaign ? ` · ${m.campaign}` : ""} · {m.delivered_at ? `already sent ${fmtDate(m.delivered_at, workspace.timezone)} (${m.source})` : "held — not sent"} · fact sheet v{m.fact_sheet_version ?? "–"}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {m.score != null && (
              <CheckScores scores={{ hallucination: m.hallucination_score, policy: m.policy_score, regulatory: m.regulatory_score, pii: m.pii_score }} />
            )}
            <div className="rounded-md bg-muted/40 p-3">
              <HighlightedBody body={m.body} violations={m.violations ?? []} />
            </div>
            <ViolationList violations={m.violations ?? []} />
            <QueueActions messageId={m.id} body={m.body} blocked={Boolean(m.has_block)} delivered={Boolean(m.delivered_at)} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
