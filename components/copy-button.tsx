"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

export function SecretOnce({ value }: { value: string }) {
  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
      <p className="text-xs font-medium text-amber-900">Webhook API key — shown once. Store it in your AI SDR now; we only keep a hash.</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-white px-2 py-1 text-xs">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}
