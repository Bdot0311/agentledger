"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser, requireWorkspace } from "@/lib/workspace";
import { generateApiKey } from "@/lib/api-keys";
import { saveFactSheetVersion } from "@/lib/facts";
import type { Severity } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// ---------------------------------------------------------------- workspace

export async function createWorkspace(name: string): Promise<Result<{ apiKey: string }>> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const db = createAdminClient();
  const { data: existing } = await db.from("workspaces").select("id").eq("owner_id", user.id).maybeSingle();
  if (existing) return { ok: false, error: "Workspace already exists" };

  const { data: ws, error } = await db
    .from("workspaces")
    .insert({ owner_id: user.id, name: name.trim() || "My workspace", digest_email: user.email })
    .select("id")
    .single();
  if (error || !ws) return { ok: false, error: error?.message ?? "Could not create workspace" };

  const key = generateApiKey();
  await db.from("integrations").insert({
    workspace_id: ws.id,
    provider: "webhook",
    api_key_hash: key.hash,
    api_key_prefix: key.prefix,
    status: "active",
  });
  return { ok: true, apiKey: key.key };
}

export async function rotateWebhookKey(): Promise<Result<{ apiKey: string }>> {
  const { workspace } = await requireWorkspace();
  const db = createAdminClient();
  const key = generateApiKey();
  await db.from("integrations").update({ status: "revoked", api_key_hash: null }).eq("workspace_id", workspace.id).eq("provider", "webhook");
  const { error } = await db.from("integrations").insert({
    workspace_id: workspace.id,
    provider: "webhook",
    api_key_hash: key.hash,
    api_key_prefix: key.prefix,
    status: "active",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/settings");
  return { ok: true, apiKey: key.key };
}

export async function updateSettings(input: {
  eval_threshold?: number;
  from_email?: string | null;
  physical_address?: string | null;
  digest_enabled?: boolean;
  digest_email?: string | null;
  timezone?: string;
  gmail_label?: string;
}): Promise<Result> {
  const { workspace } = await requireWorkspace();
  const db = createAdminClient();
  const { gmail_label, ...fields } = input;
  if (fields.eval_threshold !== undefined) {
    fields.eval_threshold = Math.max(0, Math.min(100, Math.round(fields.eval_threshold)));
  }
  const { error } = await db.from("workspaces").update(fields).eq("id", workspace.id);
  if (error) return { ok: false, error: error.message };
  if (gmail_label !== undefined) {
    await db.from("integrations").update({ config: { label: gmail_label.trim() || "AI SDR" } }).eq("workspace_id", workspace.id).eq("provider", "gmail");
  }
  revalidatePath("/app", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- fact sheet

export async function saveFactSheet(content: string): Promise<Result<{ version: number }>> {
  const { workspace, email } = await requireWorkspace();
  if (!content.trim()) return { ok: false, error: "Fact sheet is empty" };
  try {
    const version = await saveFactSheetVersion(createAdminClient(), workspace.id, content, email);
    revalidatePath("/app/facts");
    return { ok: true, version };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- policies

export async function addPolicies(rules: { rule_text: string; severity: Severity }[]): Promise<Result> {
  const { workspace } = await requireWorkspace();
  const rows = rules
    .filter((r) => r.rule_text.trim())
    .map((r) => ({ workspace_id: workspace.id, rule_text: r.rule_text.trim(), severity: r.severity === "block" ? "block" : "flag" }));
  if (!rows.length) return { ok: false, error: "No rules" };
  const { error } = await createAdminClient().from("policies").insert(rows);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/policies");
  return { ok: true };
}

export async function updatePolicy(id: string, patch: { rule_text?: string; severity?: Severity; active?: boolean }): Promise<Result> {
  const { workspace } = await requireWorkspace();
  const { error } = await createAdminClient()
    .from("policies")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspace.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/policies");
  return { ok: true };
}

// ---------------------------------------------------------------- suppressions

export async function addSuppression(email: string, reason?: string): Promise<Result> {
  const { workspace } = await requireWorkspace();
  const clean = email.trim().toLowerCase();
  if (!clean.includes("@")) return { ok: false, error: "Invalid email" };
  const { error } = await createAdminClient()
    .from("suppressions")
    .upsert({ workspace_id: workspace.id, email: clean, reason: reason ?? null }, { onConflict: "workspace_id,email" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/settings");
  return { ok: true };
}

export async function removeSuppression(id: string): Promise<Result> {
  const { workspace } = await requireWorkspace();
  await createAdminClient().from("suppressions").delete().eq("id", id).eq("workspace_id", workspace.id);
  revalidatePath("/app/settings");
  return { ok: true };
}

// ---------------------------------------------------------------- auth

export async function signOut() {
  const { createClient } = await import("@/lib/supabase/server");
  await createClient().auth.signOut();
  redirect("/");
}
