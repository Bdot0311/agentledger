import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace";
import { FactSheetEditor } from "@/components/fact-sheet-editor";
import { FACT_SHEET_TEMPLATE } from "@/lib/policy-presets";
import type { FactSheet } from "@/lib/types";

export default async function FactsPage({ searchParams }: { searchParams: { v?: string } }) {
  const { workspace } = await requireWorkspace();
  const { data } = await createClient().from("fact_sheets").select("*").eq("workspace_id", workspace.id).order("version", { ascending: false });
  const versions = (data ?? []) as FactSheet[];
  const latest = versions[0];
  const viewing = searchParams.v ? versions.find((v) => String(v.version) === searchParams.v) : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Fact sheet {latest ? `· v${latest.version}` : ""}</h1>
          <p className="text-sm text-muted-foreground">
            Ground truth for the hallucination check. Saving creates a new version; messages keep the version that was current when they were ingested.
          </p>
        </div>
        {viewing && viewing.version !== latest?.version ? (
          <div className="space-y-2">
            <p className="text-sm">Viewing v{viewing.version} (read-only) · {new Date(viewing.created_at).toLocaleString()} · {viewing.created_by ?? "unknown"}</p>
            <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-4 font-mono text-xs">{viewing.content}</pre>
          </div>
        ) : (
          <FactSheetEditor initial={latest?.content ?? FACT_SHEET_TEMPLATE} version={latest?.version ?? 0} />
        )}
      </div>
      <aside className="space-y-2">
        <h2 className="text-sm font-semibold">Version history</h2>
        <ul className="space-y-1 text-sm">
          {versions.map((v) => (
            <li key={v.id}>
              <a className="hover:underline" href={v.version === latest?.version ? "/app/facts" : `/app/facts?v=${v.version}`}>
                v{v.version}
              </a>{" "}
              <span className="text-xs text-muted-foreground">
                {new Date(v.created_at).toLocaleDateString()} · {v.created_by ?? "–"}
              </span>
            </li>
          ))}
          {!versions.length && <li className="text-muted-foreground">No versions yet.</li>}
        </ul>
      </aside>
    </div>
  );
}
