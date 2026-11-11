import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sessionWorkspace } from "@/lib/route-auth";
import { csvToRecords } from "@/lib/csv";
import { ingestMessages, ingestMessageSchema, type ParsedIngestMessage } from "@/lib/ingest";

export const dynamic = "force-dynamic";

/** multipart/form-data with `file` (CSV). Required columns: recipient_email (or to/email), body. */
export async function POST(req: Request) {
  const auth = await sessionWorkspace();
  if ("response" in auth) return auth.response;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size > 5_000_000) return NextResponse.json({ error: "CSV larger than 5 MB" }, { status: 413 });

  const records = csvToRecords(await file.text());
  const valid: ParsedIngestMessage[] = [];
  const errors: { row: number; error: string }[] = [];
  records.forEach((r, i) => {
    const p = ingestMessageSchema.safeParse(r);
    if (p.success) valid.push(p.data);
    else errors.push({ row: i + 2, error: p.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
  });

  const db = createAdminClient();
  const result = await ingestMessages(db, auth.workspace.id, "csv", valid);
  const { data: existing } = await db.from("integrations").select("id").eq("workspace_id", auth.workspace.id).eq("provider", "csv").maybeSingle();
  if (existing) await db.from("integrations").update({ last_synced_at: new Date().toISOString() }).eq("id", existing.id);
  else await db.from("integrations").insert({ workspace_id: auth.workspace.id, provider: "csv", status: "active", last_synced_at: new Date().toISOString() });

  return NextResponse.json({ ok: true, imported: result.inserted.length, duplicates: result.duplicates, errors: errors.slice(0, 50) });
}
