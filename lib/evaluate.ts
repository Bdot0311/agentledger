import type { SupabaseClient } from "@supabase/supabase-js";
import { getFactSheetVersion } from "@/lib/facts";
import { claudeJudge } from "@/lib/judge/claude";
import { combineEval, routeStatus, type CombinedEval } from "@/lib/judge/score";
import type { Judge } from "@/lib/judge/types";
import { assertSendable, deliverEmail, senderAddress } from "@/lib/send";
import type { EvalRow, Message, Policy, Workspace } from "@/lib/types";

export interface EvalContext {
  workspace: Pick<Workspace, "id" | "eval_threshold" | "physical_address" | "from_email">;
  factSheet: { content: string; version: number | null };
  policies: Pick<Policy, "id" | "rule_text" | "severity">[];
  doNotContact: boolean;
}

/** Pure-ish core: runs both judge passes on a body and combines them. */
export async function scoreContent(
  judge: Judge,
  ctx: EvalContext,
  msg: { subject: string | null; body: string; recipient_email: string },
): Promise<CombinedEval> {
  const [factsPolicy, regulatoryPii] = await Promise.all([
    judge.factsPolicy({
      subject: msg.subject,
      body: msg.body,
      factSheet: ctx.factSheet.content,
      factSheetVersion: ctx.factSheet.version,
      policies: ctx.policies,
    }),
    judge.regulatoryPii({
      subject: msg.subject,
      body: msg.body,
      recipientEmail: msg.recipient_email,
      consentStatus: ctx.doNotContact ? "do_not_contact" : "opted_in_or_unknown",
      physicalAddress: ctx.workspace.physical_address,
    }),
  ]);
  return combineEval({ factsPolicy, regulatoryPii, policies: ctx.policies, doNotContact: ctx.doNotContact, recipientEmail: msg.recipient_email });
}

export async function loadEvalContext(db: SupabaseClient, message: Message): Promise<EvalContext> {
  const [{ data: ws }, facts, { data: policies }, { data: dnc }] = await Promise.all([
    db.from("workspaces").select("id, eval_threshold, physical_address, from_email").eq("id", message.workspace_id).single(),
    getFactSheetVersion(db, message.workspace_id, message.fact_sheet_version),
    db.from("policies").select("id, rule_text, severity").eq("workspace_id", message.workspace_id).eq("active", true).order("created_at"),
    db.from("suppressions").select("id").eq("workspace_id", message.workspace_id).eq("email", message.recipient_email.toLowerCase()).maybeSingle(),
  ]);
  if (!ws) throw new Error("workspace not found");
  return {
    workspace: ws,
    factSheet: { content: facts?.content ?? "", version: facts?.version ?? null },
    policies: (policies ?? []) as EvalContext["policies"],
    doNotContact: Boolean(dnc),
  };
}

export async function insertEval(
  db: SupabaseClient,
  message: Pick<Message, "id" | "workspace_id">,
  result: CombinedEval,
  meta: { target: "original" | "edited"; factSheetVersion: number | null; judgeModel: string },
): Promise<EvalRow> {
  const { data, error } = await db
    .from("evals")
    .insert({
      message_id: message.id,
      workspace_id: message.workspace_id,
      target: meta.target,
      ...result,
      fact_sheet_version: meta.factSheetVersion,
      judge_model: meta.judgeModel,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "could not store eval");
  return data as EvalRow;
}

/**
 * Evaluates one message's original body, stores an append-only eval row and
 * routes the message. Clean drafts (pre-send gate) are released via Resend.
 * Messages that already carry a human decision keep their status.
 */
export async function evaluateMessage(db: SupabaseClient, messageId: string, judge: Judge = claudeJudge) {
  const { data: message } = await db.from("messages").select("*").eq("id", messageId).single();
  if (!message) throw new Error("message not found");
  const m = message as Message;
  if (m.event_type === "reply.received") throw new Error("inbound replies are logged, not evaluated");

  const ctx = await loadEvalContext(db, m);
  const result = await scoreContent(judge, ctx, m);
  const evalRow = await insertEval(db, m, result, { target: "original", factSheetVersion: ctx.factSheet.version, judgeModel: judge.model });

  let status = m.status;
  if (["pending", "sent", "flagged", "blocked"].includes(m.status)) {
    status = routeStatus(result, ctx.workspace.eval_threshold);
    const patch: Partial<Message> = { status };
    if (status === "sent" && !m.delivered_at) {
      // Clean draft: release it through the gate.
      try {
        assertSendable(evalRow);
        await deliverEmail({ from: senderAddress(ctx.workspace.from_email), to: m.recipient_email, subject: m.subject ?? "", body: m.body });
        patch.delivered_at = new Date().toISOString();
      } catch {
        patch.status = status = "flagged"; // could not send: a human decides
      }
    }
    await db.from("messages").update(patch).eq("id", m.id);
  }
  return { eval: evalRow, status };
}

/** Evaluates pending messages, oldest first. Used by the cron and "evaluate now". */
export async function evaluatePending(db: SupabaseClient, opts: { limit?: number; workspaceId?: string; judge?: Judge } = {}) {
  let q = db.from("messages").select("id").eq("status", "pending").neq("event_type", "reply.received").order("created_at").limit(opts.limit ?? 50);
  if (opts.workspaceId) q = q.eq("workspace_id", opts.workspaceId);
  const { data } = await q;
  const ids = (data ?? []).map((r) => r.id as string);
  const results: { id: string; ok: boolean; status?: string; error?: string }[] = [];
  const CONCURRENCY = 5;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((id) => evaluateMessage(db, id, opts.judge)));
    settled.forEach((s, j) =>
      results.push(s.status === "fulfilled" ? { id: batch[j], ok: true, status: s.value.status } : { id: batch[j], ok: false, error: String(s.reason?.message ?? s.reason) }),
    );
  }
  return results;
}
