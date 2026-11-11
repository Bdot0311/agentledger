import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckScores, HighlightedBody, ScoreBadge, StatusBadge, ViolationList } from "@/components/score";
import { ReevaluateButton } from "@/components/reevaluate-button";
import { fmtDate } from "@/lib/format";
import type { EvalRow, Message } from "@/lib/types";

export default async function MessageDetail({ params }: { params: { id: string } }) {
  const { workspace } = await requireWorkspace();
  const db = createClient();
  const { data: message } = await db.from("messages").select("*").eq("id", params.id).maybeSingle();
  if (!message) notFound();
  const m = message as Message;
  const [{ data: evals }, { data: approvals }] = await Promise.all([
    db.from("evals").select("*").eq("message_id", m.id).order("evaluated_at", { ascending: false }),
    db.from("approvals").select("*").eq("message_id", m.id).order("decided_at", { ascending: false }),
  ]);
  const evalRows = (evals ?? []) as EvalRow[];
  const latest = evalRows.find((e) => e.target === "original") ?? evalRows[0];
  const tz = workspace.timezone;

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/app/log" className="text-sm text-muted-foreground underline">
        ← Audit log
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{m.subject || "(no subject)"}</h1>
        <StatusBadge status={m.status} />
        <ScoreBadge score={latest?.score} threshold={workspace.eval_threshold} />
        {m.event_type !== "reply.received" && <ReevaluateButton messageId={m.id} />}
      </div>

      <Card>
        <CardContent className="grid gap-2 pt-5 text-sm sm:grid-cols-2">
          <div><span className="text-muted-foreground">To:</span> {m.recipient_email}</div>
          <div><span className="text-muted-foreground">Agent:</span> {m.agent_name}</div>
          <div><span className="text-muted-foreground">Source:</span> {m.source} · {m.event_type}</div>
          <div><span className="text-muted-foreground">Sent:</span> {m.delivered_at ? fmtDate(m.delivered_at, tz) : "not sent"}</div>
          <div><span className="text-muted-foreground">Campaign / template:</span> {m.campaign ?? "–"} / {m.template ?? "–"}</div>
          <div><span className="text-muted-foreground">Prompt / model:</span> {m.prompt_version ?? "–"} / {m.model ?? "–"}</div>
          <div><span className="text-muted-foreground">Fact sheet at send:</span> v{m.fact_sheet_version ?? "–"}</div>
          <div className="truncate"><span className="text-muted-foreground">Record id:</span> <code className="text-xs">{m.id}</code></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Message</CardTitle></CardHeader>
        <CardContent><HighlightedBody body={m.body} violations={latest?.violations ?? []} /></CardContent>
      </Card>

      {latest && (
        <Card>
          <CardHeader><CardTitle className="text-base">Latest eval · {fmtDate(latest.evaluated_at, tz)} · {latest.judge_model}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <CheckScores scores={{ hallucination: latest.hallucination_score, policy: latest.policy_score, regulatory: latest.regulatory_score, pii: latest.pii_score }} />
            <ViolationList violations={latest.violations} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">History (append-only)</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {[
              ...evalRows.map((e) => ({ at: e.evaluated_at, text: `Evaluated (${e.target}) → score ${e.score}, ${e.violations.length} violation(s), fact sheet v${e.fact_sheet_version ?? "–"}` })),
              ...(approvals ?? []).map((a) => ({ at: a.decided_at as string, text: `${a.decision} by ${a.decided_by}${a.note ? ` — “${a.note}”` : ""}${a.send_id ? ` · send ${a.send_id}` : ""}` })),
              { at: m.created_at, text: `Ingested via ${m.source}` },
            ]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((h, i) => (
                <li key={i}><span className="text-muted-foreground">{fmtDate(h.at, tz)}</span> — {h.text}</li>
              ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
