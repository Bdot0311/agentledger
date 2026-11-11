"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPolicies, createWorkspace, saveFactSheet } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SecretOnce } from "@/components/copy-button";
import { FACT_SHEET_TEMPLATE, STARTER_POLICIES } from "@/lib/policy-presets";
import type { Severity } from "@/lib/types";

type Step = "workspace" | "gmail" | "facts" | "policies" | "done";
const STEPS: Step[] = ["workspace", "gmail", "facts", "policies", "done"];

export function OnboardingWizard({ initialStep, gmailConfigured, gmailStatus }: { initialStep: Step; gmailConfigured: boolean; gmailStatus: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [facts, setFacts] = useState(FACT_SHEET_TEMPLATE);
  const [rules, setRules] = useState(STARTER_POLICIES.map((r) => ({ ...r })));

  const go = (s: Step) => {
    setError("");
    setStep(s);
    router.replace(`/onboarding?step=${s}`);
  };

  return (
    <div className="space-y-6">
      <ol className="flex gap-2 text-xs text-muted-foreground">
        {STEPS.map((s, i) => (
          <li key={s} className={s === step ? "font-semibold text-foreground" : ""}>
            {i + 1}. {s === "gmail" ? "Connect Gmail" : s[0].toUpperCase() + s.slice(1)}
          </li>
        ))}
      </ol>

      {step === "workspace" && (
        <Card>
          <CardHeader>
            <CardTitle>Name your workspace</CardTitle>
            <CardDescription>Usually your company name.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {apiKey ? (
              <>
                <SecretOnce value={apiKey} />
                <Button onClick={() => go("gmail")}>I saved it — continue</Button>
              </>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  start(async () => {
                    const r = await createWorkspace(name);
                    if (r.ok) setApiKey(r.apiKey);
                    else setError(r.error);
                  });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="name">Workspace name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." required />
                </div>
                <Button disabled={pending}>{pending ? "Creating…" : "Create workspace"}</Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {step === "gmail" && (
        <Card>
          <CardHeader>
            <CardTitle>Connect Gmail (optional)</CardTitle>
            <CardDescription>
              Read-only access. We import sent messages that carry a label (default <code>AI SDR</code>) so only your agent&apos;s mail is audited.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            {gmailStatus === "connected" && <p className="w-full text-sm text-emerald-700">Gmail connected.</p>}
            {gmailStatus === "error" && <p className="w-full text-sm text-destructive">Gmail connection failed. Try again or skip.</p>}
            {gmailConfigured ? (
              <Button asChild>
                <a href="/api/integrations/gmail/start?next=/onboarding%3Fstep%3Dfacts">Connect Gmail</a>
              </Button>
            ) : (
              <p className="w-full text-sm text-muted-foreground">Gmail OAuth is not configured on this deployment (GOOGLE_CLIENT_ID).</p>
            )}
            <Button variant="outline" onClick={() => go("facts")}>
              Skip for now
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "facts" && (
        <Card>
          <CardHeader>
            <CardTitle>Paste your fact sheet</CardTitle>
            <CardDescription>The ground truth. Any claim your agent makes that isn&apos;t here is a violation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea className="min-h-[320px] font-mono text-xs" value={facts} onChange={(e) => setFacts(e.target.value)} />
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveFactSheet(facts);
                  if (r.ok) go("policies");
                  else setError(r.error);
                })
              }
            >
              Save fact sheet (v1)
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "policies" && (
        <Card>
          <CardHeader>
            <CardTitle>Add your first 3 rules</CardTitle>
            <CardDescription>Plain English. Block = must not send. Flag = log and alert.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rules.map((r, i) => (
              <div key={i} className="flex gap-2">
                <Input value={r.rule_text} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, rule_text: e.target.value } : x)))} />
                <select
                  className="rounded-md border px-2 text-sm"
                  value={r.severity}
                  onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, severity: e.target.value as Severity } : x)))}
                >
                  <option value="block">block</option>
                  <option value="flag">flag</option>
                </select>
              </div>
            ))}
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await addPolicies(rules);
                  if (r.ok) go("done");
                  else setError(r.error);
                })
              }
            >
              Save rules
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "done" && (
        <Card>
          <CardHeader>
            <CardTitle>You&apos;re set up</CardTitle>
            <CardDescription>
              New messages are scored every 15 minutes. Import a CSV or point your AI SDR at <code>POST /api/ingest</code> from Settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/app")}>Open dashboard</Button>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
