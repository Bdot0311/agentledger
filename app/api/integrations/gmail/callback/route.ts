import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sessionWorkspace } from "@/lib/route-auth";
import { DEFAULT_GMAIL_LABEL, exchangeGmailCode, syncGmailIntegration } from "@/lib/gmail";

export const dynamic = "force-dynamic";

function withParam(path: string, key: string, value: string, base: string) {
  const u = new URL(path, base);
  u.searchParams.set(key, value);
  return u;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  let cookie: { state: string; next: string } | null = null;
  try {
    cookie = JSON.parse(req.cookies.get("al_gmail_oauth")?.value ?? "null");
  } catch {}
  const next = cookie?.next ?? "/app/settings";
  const fail = () => NextResponse.redirect(withParam(next, "gmail", "error", url.origin));

  const auth = await sessionWorkspace();
  if ("response" in auth) return NextResponse.redirect(new URL("/login", url.origin));
  const code = url.searchParams.get("code");
  if (!code || !cookie || cookie.state !== url.searchParams.get("state")) return fail();

  try {
    const tokens = await exchangeGmailCode(code);
    if (!tokens.refreshToken) return fail();
    const db = createAdminClient();
    const { data: existing } = await db
      .from("integrations")
      .select("id")
      .eq("workspace_id", auth.workspace.id)
      .eq("provider", "gmail")
      .eq("account_id", tokens.email)
      .maybeSingle();
    let integrationId = existing?.id as string | undefined;
    if (!integrationId) {
      const { data, error } = await db
        .from("integrations")
        .insert({ workspace_id: auth.workspace.id, provider: "gmail", account_id: tokens.email, status: "active", config: { label: DEFAULT_GMAIL_LABEL } })
        .select("id")
        .single();
      if (error || !data) return fail();
      integrationId = data.id as string;
    } else {
      await db.from("integrations").update({ status: "active" }).eq("id", integrationId);
    }
    await db.from("integration_secrets").upsert({ integration_id: integrationId, refresh_token: tokens.refreshToken, updated_at: new Date().toISOString() });
    // First import right away so the dashboard isn't empty.
    await syncGmailIntegration(db, integrationId).catch(() => undefined);
    const res = NextResponse.redirect(withParam(next, "gmail", "connected", url.origin));
    res.cookies.delete("al_gmail_oauth");
    return res;
  } catch {
    return fail();
  }
}
