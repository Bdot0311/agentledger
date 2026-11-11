import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/types";

/** Resolves the signed-in user's workspace for route handlers, or a 401 response. */
export async function sessionWorkspace(): Promise<{ workspace: Workspace; email: string } | { response: NextResponse }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const { data } = await supabase.from("workspaces").select("*").eq("owner_id", user.id).maybeSingle();
  if (!data) return { response: NextResponse.json({ error: "no workspace" }, { status: 403 }) };
  return { workspace: data as Workspace, email: user.email ?? user.id };
}

export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
