import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sessionWorkspace } from "@/lib/route-auth";
import { fetchAllLedgerRows, ledgerToCsv, parseLedgerFilters } from "@/lib/ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Audit evidence export. `format=csv` → one row per message with its latest eval
 * and decision. `format=json` → every message with its full eval and approval
 * history, plus the fact-sheet versions referenced.
 */
export async function GET(req: Request) {
  const auth = await sessionWorkspace();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const filters = parseLedgerFilters(url.searchParams);
  const db = createAdminClient();
  const rows = await fetchAllLedgerRows(db, auth.workspace.id, filters);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  if (format === "csv") {
    return new NextResponse(ledgerToCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="agentledger-audit-${stamp}.csv"`,
      },
    });
  }

  const ids = rows.map((r) => r.id);
  const evals: Record<string, unknown>[] = [];
  const approvals: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [e, a] = await Promise.all([
      db.from("evals").select("*").in("message_id", chunk).order("evaluated_at"),
      db.from("approvals").select("*").in("message_id", chunk).order("decided_at"),
    ]);
    evals.push(...(e.data ?? []));
    approvals.push(...(a.data ?? []));
  }
  const versions = Array.from(new Set(rows.map((r) => r.fact_sheet_version).filter((v): v is number => v != null)));
  const { data: factSheets } = versions.length
    ? await db.from("fact_sheets").select("version, content, created_at, created_by").eq("workspace_id", auth.workspace.id).in("version", versions)
    : { data: [] };

  const messages = rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    source: r.source,
    event_type: r.event_type,
    external_id: r.external_id,
    agent_name: r.agent_name,
    campaign: r.campaign,
    template: r.template,
    recipient_email: r.recipient_email,
    subject: r.subject,
    body: r.body,
    sent_at: r.sent_at,
    delivered_at: r.delivered_at,
    status: r.status,
    fact_sheet_version: r.fact_sheet_version,
    prompt_version: r.prompt_version,
    model: r.model,
    evals: evals.filter((e) => e.message_id === r.id),
    approvals: approvals.filter((a) => a.message_id === r.id),
  }));

  const payload = {
    exported_at: new Date().toISOString(),
    workspace: { id: auth.workspace.id, name: auth.workspace.name },
    exported_by: auth.email,
    filters,
    count: messages.length,
    fact_sheets: factSheets ?? [],
    messages,
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="agentledger-audit-${stamp}.json"`,
    },
  });
}
