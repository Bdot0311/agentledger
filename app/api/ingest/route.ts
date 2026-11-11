import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashApiKey, readApiKey } from "@/lib/api-keys";
import { ingestMessages, ingestMessageSchema } from "@/lib/ingest";
import { evaluateMessage } from "@/lib/evaluate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const payloadSchema = z.union([z.object({ messages: z.array(ingestMessageSchema).min(1).max(100) }), ingestMessageSchema]);

/**
 * Webhook for any AI SDR. Auth: `Authorization: Bearer al_live_…` (or `x-api-key`).
 * Body: one event, or `{ messages: [...] }` (max 100). Messages are queued for eval.
 * `?sync=1` (max 5 messages) evaluates inline and returns each verdict, so an
 * AI SDR can use AgentLedger as a synchronous pre-send gate for `message.draft`.
 */
export async function POST(req: Request) {
  const key = readApiKey(req.headers);
  if (!key) return NextResponse.json({ error: "missing API key" }, { status: 401 });
  const db = createAdminClient();
  const { data: integ } = await db
    .from("integrations")
    .select("workspace_id")
    .eq("provider", "webhook")
    .eq("status", "active")
    .eq("api_key_hash", hashApiKey(key))
    .maybeSingle();
  if (!integ) return NextResponse.json({ error: "invalid API key" }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  const items = "messages" in parsed.data ? parsed.data.messages : [parsed.data];

  const sync = new URL(req.url).searchParams.get("sync") === "1";
  if (sync && items.length > 5) return NextResponse.json({ error: "sync=1 accepts at most 5 messages" }, { status: 400 });

  try {
    const result = await ingestMessages(db, integ.workspace_id, "webhook", items);
    if (sync) {
      const verdicts = await Promise.all(
        result.inserted
          .filter((m) => m.status === "pending")
          .map(async (m) => {
            try {
              const { eval: e, status } = await evaluateMessage(db, m.id);
              return { id: m.id, external_id: m.external_id, status, score: e.score, send_allowed: status === "sent", violations: e.violations };
            } catch (err) {
              return { id: m.id, external_id: m.external_id, status: "pending", error: (err as Error).message, send_allowed: false };
            }
          }),
      );
      return NextResponse.json({ ok: true, duplicates: result.duplicates, verdicts });
    }
    return NextResponse.json({ ok: true, ...result, queued: result.inserted.filter((m) => m.status === "pending").length }, { status: 202 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
