import { Resend } from "resend";
import type { EvalRow } from "@/lib/types";

export class SendRejectedError extends Error {
  constructor(
    message: string,
    public readonly status: number = 409,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "SendRejectedError";
  }
}

/**
 * The pre-send gate. Every code path that delivers a message must call this
 * with the eval of the exact body being sent. No eval or a block-severity
 * violation means the message does not leave.
 */
export function assertSendable(evalRow: Pick<EvalRow, "has_block" | "violations"> | null | undefined): void {
  if (!evalRow) throw new SendRejectedError("Message has not been evaluated; refusing to send.");
  if (evalRow.has_block) {
    const rules = evalRow.violations.filter((v) => v.severity === "block").map((v) => v.rule);
    throw new SendRejectedError(`Blocked: ${rules.join("; ") || "block-severity violation"}. Edit the message to clear the block, or reject it.`, 409, { rules });
  }
}

export interface OutboundEmail {
  from: string;
  to: string;
  subject: string;
  body: string;
}

export function senderAddress(workspaceFrom: string | null | undefined): string {
  const from = workspaceFrom || process.env.RESEND_FROM;
  if (!from) throw new SendRejectedError("No from-address configured (Settings → Resend from-address).", 503);
  return from;
}

/**
 * Sends through Resend. Without RESEND_API_KEY outside production this is a
 * dry run (recorded as such in the audit trail) so the demo works offline.
 */
export async function deliverEmail(email: OutboundEmail): Promise<{ id: string; dryRun: boolean }> {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") throw new SendRejectedError("RESEND_API_KEY is not configured.", 503);
    return { id: `dry-run-${Date.now()}`, dryRun: true };
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({ from: email.from, to: email.to, subject: email.subject, text: email.body });
  if (error || !data) throw new SendRejectedError(`Resend error: ${error?.message ?? "unknown"}`, 502);
  return { id: data.id, dryRun: false };
}
