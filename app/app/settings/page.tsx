import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { appUrl } from "@/lib/utils";
import { WorkspaceSettingsForm, WebhookKeyCard, CsvImport, GmailCard, SuppressionList, TestEval, EvaluateNow } from "@/components/settings";

export default async function SettingsPage({ searchParams }: { searchParams: { gmail?: string } }) {
  const { workspace } = await requireWorkspace();
  const db = createClient();
  const [{ data: integrations }, { data: suppressions }, { count: pending }] = await Promise.all([
    db.from("integrations").select("*").eq("workspace_id", workspace.id).order("connected_at"),
    db.from("suppressions").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
    db.from("messages").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "pending"),
  ]);
  const webhook = (integrations ?? []).find((i) => i.provider === "webhook" && i.status === "active");
  const gmail = (integrations ?? []).filter((i) => i.provider === "gmail");
  const csv = (integrations ?? []).find((i) => i.provider === "csv");

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gmail</CardTitle>
          <CardDescription>Read-only. Imports sent mail carrying your agent&apos;s label every 15 minutes.</CardDescription>
        </CardHeader>
        <CardContent>
          <GmailCard
            configured={Boolean(process.env.GOOGLE_CLIENT_ID)}
            status={searchParams.gmail ?? null}
            accounts={gmail.map((g) => ({ id: g.id, email: g.account_id, label: g.config?.label ?? "AI SDR", lastSynced: g.last_synced_at }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook ingest</CardTitle>
          <CardDescription>Any AI SDR can push events to <code>POST {appUrl("/api/ingest")}</code>.</CardDescription>
        </CardHeader>
        <CardContent>
          <WebhookKeyCard prefix={webhook?.api_key_prefix ?? null} endpoint={appUrl("/api/ingest")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">CSV import</CardTitle>
          <CardDescription>
            Columns: <code>recipient_email</code>, <code>body</code> (required); <code>subject, sent_at, agent_name, campaign, template, prompt_version, model, external_id, do_not_contact</code>.
            {csv?.last_synced_at && ` Last import ${new Date(csv.last_synced_at).toLocaleString()}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CsvImport />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evaluation</CardTitle>
          <CardDescription>{pending ?? 0} message(s) waiting for the next eval run (every 15 min).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <EvaluateNow pending={pending ?? 0} />
          <WorkspaceSettingsForm workspace={workspace} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Do-not-contact list</CardTitle>
          <CardDescription>Any message to these recipients is an instant block.</CardDescription>
        </CardHeader>
        <CardContent>
          <SuppressionList items={(suppressions ?? []).map((s) => ({ id: s.id, email: s.email, reason: s.reason }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Test eval</CardTitle>
          <CardDescription>Score a draft against your current fact sheet and rules. Nothing is stored.</CardDescription>
        </CardHeader>
        <CardContent>
          <TestEval />
        </CardContent>
      </Card>
    </div>
  );
}
