"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addSuppression, removeSuppression, rotateWebhookKey, testEval, updateSettings } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton, SecretOnce } from "@/components/copy-button";
import { CheckScores, ViolationList } from "@/components/score";
import type { Workspace } from "@/lib/types";

export function GmailCard({ configured, status, accounts }: { configured: boolean; status: string | null; accounts: { id: string; email: string | null; label: string; lastSynced: string | null }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [label, setLabel] = useState(accounts[0]?.label ?? "AI SDR");
  const [pending, start] = useTransition();
  if (!configured) return <p className="text-sm text-muted-foreground">Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET to enable Gmail.</p>;
  return (
    <div className="space-y-3 text-sm">
      {status === "connected" && <p className="text-emerald-700">Gmail connected.</p>}
      {status === "error" && <p className="text-destructive">Gmail connection failed.</p>}
      {accounts.map((a) => (
        <p key={a.id}>
          <strong>{a.email}</strong> · label “{a.label}” · last synced {a.lastSynced ? new Date(a.lastSynced).toLocaleString() : "never"}
        </p>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <Button asChild variant={accounts.length ? "outline" : "default"} size="sm">
          <a href="/api/integrations/gmail/start?next=/app/settings">{accounts.length ? "Connect another account" : "Connect Gmail"}</a>
        </Button>
        {accounts.length > 0 && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await fetch("/api/integrations/gmail/sync", { method: "POST" }).then((r) => r.json());
                setMsg(r.ok ? `Imported ${r.imported} new message(s).` : r.errors?.join("; ") ?? "Sync failed");
                setBusy(false);
                router.refresh();
              }}
            >
              {busy ? "Syncing…" : "Sync now"}
            </Button>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Gmail label for AI SDR mail</Label>
                <Input className="h-9 w-40" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => void (await updateSettings({ gmail_label: label })))}>
                Save label
              </Button>
            </div>
          </>
        )}
      </div>
      {msg && <p className="text-muted-foreground">{msg}</p>}
    </div>
  );
}

export function WebhookKeyCard({ prefix, endpoint }: { prefix: string | null; endpoint: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const curl = `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ${key ?? "al_live_…"}" \\
  -H "Content-Type: application/json" \\
  -d '{"event":"message.sent","agent_name":"my-ai-sdr","recipient_email":"dana@prospect.com","subject":"Hi","body":"…"}'`;
  return (
    <div className="space-y-3 text-sm">
      {key ? <SecretOnce value={key} /> : <p>Active key: <code>{prefix ? `${prefix}…` : "none"}</code> (only a hash is stored)</p>}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (!confirm("Rotate the key? The current key stops working immediately.")) return;
          start(async () => {
            const r = await rotateWebhookKey();
            if (r.ok) setKey(r.apiKey);
          });
        }}
      >
        {prefix ? "Rotate key" : "Generate key"}
      </Button>
      <div className="relative">
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{curl}</pre>
        <div className="absolute right-2 top-2"><CopyButton value={curl} /></div>
      </div>
      <p className="text-xs text-muted-foreground">
        Events: <code>message.sent</code>, <code>followup.sent</code>, <code>reply.received</code>, and <code>message.draft</code> (pre-send gate: held until it passes, or until you approve it). Add <code>?sync=1</code> to get the verdict in the response. Batch with <code>{"{ \"messages\": [...] }"}</code>.
      </p>
    </div>
  );
}

export function CsvImport() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const file = ref.current?.files?.[0];
        if (!file) return;
        setBusy(true);
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch("/api/import/csv", { method: "POST", body: fd }).then((r) => r.json());
        setMsg(r.ok ? `Imported ${r.imported}, skipped ${r.duplicates} duplicate(s)${r.errors?.length ? `, ${r.errors.length} invalid row(s) (first: row ${r.errors[0].row} – ${r.errors[0].error})` : ""}.` : r.error);
        setBusy(false);
        router.refresh();
      }}
    >
      <input ref={ref} type="file" accept=".csv,text/csv" className="text-sm" />
      <Button size="sm" disabled={busy}>{busy ? "Importing…" : "Import CSV"}</Button>
      {msg && <p className="w-full text-muted-foreground">{msg}</p>}
    </form>
  );
}

export function EvaluateNow({ pending }: { pending: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div className="flex items-center gap-3 text-sm">
      <Button
        size="sm"
        disabled={busy || pending === 0}
        onClick={async () => {
          setBusy(true);
          const r = await fetch("/api/evaluate/pending", { method: "POST" }).then((r) => r.json());
          setMsg(`Evaluated ${r.evaluated ?? 0}${r.failed?.length ? `, ${r.failed.length} failed: ${r.failed[0].error}` : ""}.`);
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "Evaluating…" : "Evaluate pending now"}
      </Button>
      {msg && <span className="text-muted-foreground">{msg}</span>}
    </div>
  );
}

export function WorkspaceSettingsForm({ workspace }: { workspace: Workspace }) {
  const [threshold, setThreshold] = useState(workspace.eval_threshold);
  const [fromEmail, setFromEmail] = useState(workspace.from_email ?? "");
  const [address, setAddress] = useState(workspace.physical_address ?? "");
  const [digest, setDigest] = useState(workspace.digest_enabled);
  const [digestEmail, setDigestEmail] = useState(workspace.digest_email ?? "");
  const [tz, setTz] = useState(workspace.timezone);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <form
      className="space-y-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateSettings({
            eval_threshold: threshold,
            from_email: fromEmail || null,
            physical_address: address || null,
            digest_enabled: digest,
            digest_email: digestEmail || null,
            timezone: tz,
          });
          setMsg(r.ok ? "Saved." : r.error);
        });
      }}
    >
      <div className="space-y-1">
        <Label>Approval threshold: {threshold}</Label>
        <input type="range" min={0} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full" />
        <p className="text-xs text-muted-foreground">Messages scoring below this go to the approval queue.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Resend from-address</Label>
          <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="Sam <sam@acme.com>" />
        </div>
        <div className="space-y-1">
          <Label>Timezone</Label>
          <Input value={tz} onChange={(e) => setTz(e.target.value)} placeholder="America/New_York" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Physical postal address (CAN-SPAM)</Label>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="If set, every email must include it" />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={digest} onChange={(e) => setDigest(e.target.checked)} /> Weekly digest, Mondays 8am
        </label>
        <div className="flex-1 space-y-1">
          <Label>Digest recipient</Label>
          <Input value={digestEmail} onChange={(e) => setDigestEmail(e.target.value)} placeholder="you@company.com" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={pending}>Save settings</Button>
        {msg && <span className="text-muted-foreground">{msg}</span>}
      </div>
    </form>
  );
}

export function SuppressionList({ items }: { items: { id: string; email: string; reason: string | null }[] }) {
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 text-sm">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addSuppression(email, "added manually");
            if (r.ok) setEmail("");
          });
        }}
      >
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prospect@company.com" />
        <Button size="sm" disabled={pending || !email}>Add</Button>
      </form>
      <ul className="space-y-1">
        {items.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded border px-2 py-1">
            <span>{s.email} <span className="text-xs text-muted-foreground">{s.reason}</span></span>
            <button className="text-xs underline" onClick={() => start(async () => void (await removeSuppression(s.id)))}>remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TestEval() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof testEval>> | null>(null);
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Recipient (optional)" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <Textarea className="min-h-[160px]" placeholder="Paste an email your AI SDR wrote…" value={body} onChange={(e) => setBody(e.target.value)} />
      <Button size="sm" disabled={pending || !body.trim()} onClick={() => start(async () => setResult(await testEval({ subject, body, recipient_email: to })))}>
        {pending ? "Judging…" : "Run test eval"}
      </Button>
      {result && !result.ok && <p className="text-destructive">{result.error}</p>}
      {result?.ok && (
        <div className="space-y-3 rounded-md border p-3">
          <p>
            Score <strong>{result.result.score}</strong> → would be <strong>{result.route}</strong> (fact sheet v{result.factSheetVersion ?? "–"})
          </p>
          <CheckScores scores={{ hallucination: result.result.hallucination_score, policy: result.result.policy_score, regulatory: result.result.regulatory_score, pii: result.result.pii_score }} />
          <ViolationList violations={result.result.violations} />
        </div>
      )}
    </div>
  );
}
