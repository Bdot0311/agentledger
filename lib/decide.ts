import { assertSendable, SendRejectedError, type OutboundEmail } from "@/lib/send";
import type { EvalRow, Message } from "@/lib/types";

export type Decision = "approved" | "rejected" | "edited";

/** Side effects the decision needs; injected so the gate can be tested without a DB. */
export interface DecideDeps {
  getMessage(id: string): Promise<Message | null>;
  getLatestOriginalEval(messageId: string): Promise<EvalRow | null>;
  evaluateEditedBody(message: Message, body: string): Promise<EvalRow>;
  insertApproval(row: { message_id: string; workspace_id: string; decision: Decision; decided_by: string; note: string | null; edited_body: string | null; send_id: string | null }): Promise<void>;
  updateMessage(id: string, patch: Partial<Pick<Message, "status" | "delivered_at">>): Promise<void>;
  send(email: OutboundEmail): Promise<{ id: string; dryRun: boolean }>;
  fromAddress(): string;
}

export interface DecideInput {
  messageId: string;
  decision: Decision;
  decidedBy: string;
  note?: string | null;
  editedBody?: string | null;
}

export interface DecideResult {
  status: Message["status"];
  sendId: string | null;
  eval?: EvalRow;
}

/**
 * The only path that sends a reviewed message. Enforces:
 * - only queued (flagged/blocked) messages can be decided
 * - `approved` re-checks the stored eval: block-severity violations never send
 * - `edited` re-evaluates the new body and applies the same gate to it
 */
export async function decide(deps: DecideDeps, input: DecideInput): Promise<DecideResult> {
  const message = await deps.getMessage(input.messageId);
  if (!message) throw new SendRejectedError("Message not found", 404);
  if (message.status !== "flagged" && message.status !== "blocked") {
    throw new SendRejectedError(`Message is ${message.status}; only queued messages can be decided.`, 409);
  }
  const base = { message_id: message.id, workspace_id: message.workspace_id, decided_by: input.decidedBy, note: input.note?.trim() || null };

  if (input.decision === "rejected") {
    await deps.insertApproval({ ...base, decision: "rejected", edited_body: null, send_id: null });
    await deps.updateMessage(message.id, { status: "rejected" });
    return { status: "rejected", sendId: null };
  }

  if (input.decision === "approved") {
    const latest = await deps.getLatestOriginalEval(message.id);
    assertSendable(latest); // throws 409 on block-severity violations
    let sendId: string | null = null;
    if (!message.delivered_at) {
      const sent = await deps.send({ from: deps.fromAddress(), to: message.recipient_email, subject: message.subject ?? "", body: message.body });
      sendId = sent.id;
    }
    await deps.insertApproval({ ...base, decision: "approved", edited_body: null, send_id: sendId });
    await deps.updateMessage(message.id, { status: "approved", ...(sendId ? { delivered_at: new Date().toISOString() } : {}) });
    return { status: "approved", sendId };
  }

  // edited → re-evaluate the edited body, then gate it like any other send
  const body = input.editedBody?.trim();
  if (!body) throw new SendRejectedError("edited_body is required for an edit", 400);
  if (message.delivered_at) throw new SendRejectedError("This message was already delivered; it can be approved or rejected, not edited.", 409);
  const evalRow = await deps.evaluateEditedBody(message, body);
  try {
    assertSendable(evalRow);
  } catch (e) {
    if (e instanceof SendRejectedError) throw new SendRejectedError(`Edited version still blocked. ${e.message}`, 409, { eval: evalRow });
    throw e;
  }
  const sent = await deps.send({ from: deps.fromAddress(), to: message.recipient_email, subject: message.subject ?? "", body });
  await deps.insertApproval({ ...base, decision: "edited", edited_body: body, send_id: sent.id });
  await deps.updateMessage(message.id, { status: "approved", delivered_at: new Date().toISOString() });
  return { status: "approved", sendId: sent.id, eval: evalRow };
}
