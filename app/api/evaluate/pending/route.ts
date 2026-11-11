import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sessionWorkspace } from "@/lib/route-auth";
import { evaluatePending } from "@/lib/evaluate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** "Evaluate now" button: scores this workspace's pending messages without waiting for the cron. */
export async function POST() {
  const auth = await sessionWorkspace();
  if ("response" in auth) return auth.response;
  const results = await evaluatePending(createAdminClient(), { workspaceId: auth.workspace.id, limit: 25 });
  return NextResponse.json({ ok: true, evaluated: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) });
}
