import type { SupabaseClient } from "@supabase/supabase-js";
import type { FactSheet } from "@/lib/types";

/** Inserts a new fact-sheet version. Never updates an existing row. */
export async function saveFactSheetVersion(db: SupabaseClient, workspaceId: string, content: string, createdBy: string | null): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await getLatestFactSheet(db, workspaceId);
    if (latest && latest.content === content) return latest.version; // no-op edit: don't mint a version
    const version = (latest?.version ?? 0) + 1;
    const { error } = await db.from("fact_sheets").insert({ workspace_id: workspaceId, version, content, created_by: createdBy });
    if (!error) return version;
    if (error.code !== "23505") throw new Error(error.message); // retry only on version race
  }
  throw new Error("Could not save fact sheet (concurrent edits)");
}

export async function getLatestFactSheet(db: SupabaseClient, workspaceId: string): Promise<FactSheet | null> {
  const { data } = await db
    .from("fact_sheets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as FactSheet | null) ?? null;
}

export async function getFactSheetVersion(db: SupabaseClient, workspaceId: string, version: number | null): Promise<FactSheet | null> {
  if (version == null) return getLatestFactSheet(db, workspaceId);
  const { data } = await db.from("fact_sheets").select("*").eq("workspace_id", workspaceId).eq("version", version).maybeSingle();
  return (data as FactSheet | null) ?? null;
}
