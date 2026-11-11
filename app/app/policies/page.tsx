import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace";
import { PolicyEditor } from "@/components/policy-editor";
import type { Policy, Violation } from "@/lib/types";

export default async function PoliciesPage() {
  const { workspace } = await requireWorkspace();
  const db = createClient();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [{ data: policies }, { data: evals }] = await Promise.all([
    db.from("policies").select("*").eq("workspace_id", workspace.id).order("created_at"),
    db.from("evals").select("violations").eq("workspace_id", workspace.id).eq("target", "original").gte("evaluated_at", since).limit(5000),
  ]);
  const fired: Record<string, number> = {};
  for (const e of evals ?? []) for (const v of (e.violations as Violation[]) ?? []) if (v.check === "policy") fired[v.rule] = (fired[v.rule] ?? 0) + 1;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Policies</h1>
        <p className="text-sm text-muted-foreground">
          Plain-English rules checked on every message. <strong>Block</strong> = must not send. <strong>Flag</strong> = log, alert, and route to the queue. Edits apply to future evals only; past evals keep the rule text they were judged against.
        </p>
      </div>
      <PolicyEditor policies={(policies ?? []) as Policy[]} fired={fired} />
    </div>
  );
}
