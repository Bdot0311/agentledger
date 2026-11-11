import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/route-auth";
import { evaluatePending } from "@/lib/evaluate";
import { syncGmailIntegration } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Every 15 min: pull new Gmail sends, then evaluate up to 50 pending messages. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createAdminClient();

  const synced: { integration: string; imported?: number; error?: string }[] = [];
  if (process.env.GOOGLE_CLIENT_ID) {
    const { data: gmail } = await db.from("integrations").select("id").eq("provider", "gmail").eq("status", "active");
    for (const g of gmail ?? []) {
      try {
        synced.push({ integration: g.id, imported: (await syncGmailIntegration(db, g.id)).inserted.length });
      } catch (e) {
        synced.push({ integration: g.id, error: (e as Error).message });
      }
    }
  }

  const results = await evaluatePending(db, { limit: 50 });
  return NextResponse.json({ ok: true, synced, evaluated: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) });
}
