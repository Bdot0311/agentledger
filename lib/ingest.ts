import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLatestFactSheet } from "@/lib/facts";
import type { MessageSource } from "@/lib/types";

export const EVENT_TYPES = ["message.sent", "message.draft", "followup.sent", "reply.received"] as const;

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const ingestMessageSchema = z.object({
  event: z.enum(EVENT_TYPES).default("message.sent"),
  external_id: optionalText,
  agent_name: z.string().trim().min(1).max(200).default("unknown"),
  campaign: optionalText,
  template: optionalText,
  recipient_email: z.string().trim().toLowerCase().email(),
  subject: z.string().max(1000).optional().nullable(),
  body: z.string().min(1).max(100_000),
  sent_at: z
    .string()
    .datetime({ offset: true })
    .optional()
    .nullable()
    .or(z.string().refine((s) => !Number.isNaN(Date.parse(s)), "invalid date")),
  prompt_version: optionalText,
  model: optionalText,
  /** Marks the recipient do-not-contact for this workspace (instant block from now on). */
  do_not_contact: z.boolean().optional(),
});

export type IngestMessage = z.input<typeof ingestMessageSchema>;
export type ParsedIngestMessage = z.output<typeof ingestMessageSchema>;

export interface IngestResult {
  inserted: { id: string; external_id: string | null; status: string }[];
  duplicates: number;
}

/**
 * Turns ingested events into audit records. Every message is stamped with the
 * fact-sheet version current at ingest time, so later fact-sheet edits never
 * change what an old message was judged against.
 */
export async function ingestMessages(db: SupabaseClient, workspaceId: string, source: MessageSource, items: ParsedIngestMessage[]): Promise<IngestResult> {
  if (!items.length) return { inserted: [], duplicates: 0 };
  const facts = await getLatestFactSheet(db, workspaceId);

  const dnc = items.filter((i) => i.do_not_contact).map((i) => ({ workspace_id: workspaceId, email: i.recipient_email, reason: `flagged via ${source}` }));
  if (dnc.length) await db.from("suppressions").upsert(dnc, { onConflict: "workspace_id,email", ignoreDuplicates: true });

  const rows = items.map((i) => {
    const sentAt = i.sent_at ? new Date(i.sent_at).toISOString() : null;
    const isDraft = i.event === "message.draft";
    const isReply = i.event === "reply.received";
    return {
      workspace_id: workspaceId,
      source,
      external_id: i.external_id,
      event_type: i.event,
      agent_name: i.agent_name,
      campaign: i.campaign,
      template: i.template,
      recipient_email: i.recipient_email,
      subject: i.subject ?? null,
      body: i.body,
      sent_at: isDraft ? null : (sentAt ?? new Date().toISOString()),
      delivered_at: isDraft ? null : (sentAt ?? new Date().toISOString()),
      status: isReply ? "received" : "pending",
      fact_sheet_version: facts?.version ?? null,
      prompt_version: i.prompt_version,
      model: i.model,
    };
  });

  const withId = rows.filter((r) => r.external_id);
  const withoutId = rows.filter((r) => !r.external_id);
  const inserted: IngestResult["inserted"] = [];

  if (withId.length) {
    const { data, error } = await db
      .from("messages")
      .upsert(withId, { onConflict: "workspace_id,source,external_id", ignoreDuplicates: true })
      .select("id, external_id, status");
    if (error) throw new Error(error.message);
    inserted.push(...(data ?? []));
  }
  if (withoutId.length) {
    const { data, error } = await db.from("messages").insert(withoutId).select("id, external_id, status");
    if (error) throw new Error(error.message);
    inserted.push(...(data ?? []));
  }
  return { inserted, duplicates: rows.length - inserted.length };
}
