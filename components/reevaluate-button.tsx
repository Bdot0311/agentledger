"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ReevaluateButton({ messageId }: { messageId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          const res = await fetch(`/api/evaluate/${messageId}`, { method: "POST" });
          if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Eval failed");
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "Evaluating…" : "Re-evaluate"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
