import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/route-auth";
import { isDigestHour, runDigestForWorkspace } from "@/lib/digest";
import type { Workspace } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs hourly; sends to each workspace whose local time is Monday 8am and that
 * hasn't had a digest in the last 6 days. `?force=1` (cron-authorized) ignores
 * the schedule for testing. Skips workspaces with no messages this week.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  const db = createAdminClient();
  const now = new Date();
  const { data: workspaces } = await db.from("workspaces").select("*").eq("digest_enabled", true);

  const results: Record<string, unknown>[] = [];
  for (const ws of (workspaces ?? []) as Workspace[]) {
    if (!force && !isDigestHour(ws.timezone, now)) continue;
    const { data: recent } = await db
      .from("digest_runs")
      .select("id")
      .eq("workspace_id", ws.id)
      .gte("sent_at", new Date(now.getTime() - 6 * 86400_000).toISOString())
      .limit(1);
    if (!force && recent?.length) continue;
    try {
      const r = await runDigestForWorkspace(db, ws, now);
      results.push({ workspace: ws.id, ...("skipped" in r ? { skipped: r.skipped } : { sent: r.sent }) });
    } catch (e) {
      results.push({ workspace: ws.id, error: (e as Error).message });
    }
  }
  return NextResponse.json({ ok: true, results });
}
