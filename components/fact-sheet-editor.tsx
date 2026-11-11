"use client";

import { useState, useTransition } from "react";
import { saveFactSheet } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function FactSheetEditor({ initial, version }: { initial: string; version: number }) {
  const [content, setContent] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <div className="space-y-3">
      <Textarea className="min-h-[480px] font-mono text-xs" value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="flex items-center gap-3">
        <Button
          disabled={pending || content === initial}
          onClick={() =>
            start(async () => {
              const r = await saveFactSheet(content);
              setMsg(r.ok ? `Saved as v${r.version}.` : r.error);
            })
          }
        >
          Save as v{version + 1}
        </Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
