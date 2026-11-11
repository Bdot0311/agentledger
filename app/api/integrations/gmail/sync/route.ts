import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sessionWorkspace } from "@/lib/route-auth";
import { syncGmailIntegration } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await sessionWorkspace();
  if ("response" in auth) return auth.response;
  const db = createAdminClient();
  const { data: integrations } = await db.from("integrations").select("id").eq("workspace_id", auth.workspace.id).eq("provider", "gmail").eq("status", "active");
  let imported = 0;
  const errors: string[] = [];
  for (const i of integrations ?? []) {
    try {
      imported += (await syncGmailIntegration(db, i.id)).inserted.length;
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return NextResponse.json({ ok: errors.length === 0, imported, errors });
}
