import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/types";

export async function getUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Current user's workspace, or null. Uses the RLS-scoped client. */
export async function getWorkspace(): Promise<Workspace | null> {
  const supabase = createClient();
  const user = await getUser();
  if (!user) return null;
  const { data } = await supabase.from("workspaces").select("*").eq("owner_id", user.id).maybeSingle();
  return (data as Workspace | null) ?? null;
}

/** For pages/actions under /app: guarantees an authenticated user with a workspace. */
export async function requireWorkspace(): Promise<{ workspace: Workspace; email: string; userId: string }> {
  const user = await getUser();
  if (!user) redirect("/login");
  const workspace = await getWorkspace();
  if (!workspace) redirect("/onboarding");
  return { workspace, email: user.email ?? user.id, userId: user.id };
}
