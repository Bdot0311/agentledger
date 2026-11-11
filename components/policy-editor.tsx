"use client";

import { useState, useTransition } from "react";
import { addPolicies, updatePolicy } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Policy, Severity } from "@/lib/types";

function SeveritySelect({ value, onChange }: { value: Severity; onChange: (s: Severity) => void }) {
  return (
    <select className="h-10 rounded-md border px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value as Severity)}>
      <option value="block">block</option>
      <option value="flag">flag</option>
    </select>
  );
}

function PolicyRow({ p, fired }: { p: Policy; fired: number }) {
  const [text, setText] = useState(p.rule_text);
  const [severity, setSeverity] = useState<Severity>(p.severity);
  const [pending, start] = useTransition();
  const dirty = text !== p.rule_text || severity !== p.severity;
  return (
    <li className={`flex flex-wrap items-center gap-2 rounded-md border p-3 ${p.active ? "" : "opacity-60"}`}>
      <Input className="min-w-[240px] flex-1" value={text} onChange={(e) => setText(e.target.value)} />
      <SeveritySelect value={severity} onChange={setSeverity} />
      <Badge variant="outline" title="Times fired, last 30 days">{fired}×</Badge>
      {dirty && (
        <Button size="sm" disabled={pending} onClick={() => start(async () => void (await updatePolicy(p.id, { rule_text: text, severity })))}>
          Save
        </Button>
      )}
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => void (await updatePolicy(p.id, { active: !p.active })))}>
        {p.active ? "Disable" : "Enable"}
      </Button>
    </li>
  );
}

export function PolicyEditor({ policies, fired }: { policies: Policy[]; fired: Record<string, number> }) {
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<Severity>("flag");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {policies.map((p) => <PolicyRow key={p.id} p={p} fired={fired[p.rule_text] ?? 0} />)}
        {!policies.length && <li className="text-sm text-muted-foreground">No rules yet.</li>}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addPolicies([{ rule_text: text, severity }]);
            if (r.ok) setText("");
          });
        }}
      >
        <Input className="min-w-[240px] flex-1" placeholder='e.g. "Never claim we integrate with NetSuite"' value={text} onChange={(e) => setText(e.target.value)} />
        <SeveritySelect value={severity} onChange={setSeverity} />
        <Button disabled={pending || !text.trim()}>Add rule</Button>
      </form>
    </div>
  );
}
