import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashApiKey, readApiKey } from "@/lib/api-keys";
import { ingestMessages, ingestMessageSchema } from "@/lib/ingest";

export const dynamic = "force-dynamic";

const payloadSchema = z.union([z.object({ messages: z.array(ingestMessageSchema).min(1).max(100) }), ingestMessageSchema]);

/**
 * Webhook for any AI SDR. Auth: `Authorization: Bearer al_live_…` (or `x-api-key`).
 * Body: one event, or `{ messages: [...] }` (max 100). Messages are queued for eval.
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

  try {
    const result = await ingestMessages(db, integ.workspace_id, "webhook", items);
    return NextResponse.json({ ok: true, ...result, queued: result.inserted.filter((m) => m.status === "pending").length }, { status: 202 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
