"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function QueueActions({ messageId, body, blocked, delivered }: { messageId: string; body: string; blocked: boolean; delivered: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function submit(decision: "approved" | "rejected" | "edited") {
    setBusy(decision);
    setError("");
    const res = await fetch(`/api/approvals/${messageId}/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, note, edited_body: decision === "edited" ? draft : undefined }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(json.error ?? "Failed");
    router.refresh();
  }

  return (
    <div className="space-y-3 border-t pt-4">
      {editing && <Textarea className="min-h-[200px] text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} />}
      <Input placeholder="Note for the audit log (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button disabled={!!busy} onClick={() => submit("edited")}>
              {busy === "edited" ? "Re-checking & sending…" : "Re-check & approve edit"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel edit
            </Button>
          </>
        ) : (
          <>
            <Button
              disabled={!!busy || blocked}
              title={blocked ? "Block-severity violation: edit the message to clear it, or reject" : undefined}
              onClick={() => submit("approved")}
            >
              {busy === "approved" ? "Sending…" : delivered ? "Approve (acknowledge)" : "Approve & send"}
            </Button>
            {!delivered && (
              <Button variant="outline" disabled={!!busy} onClick={() => setEditing(true)}>
                Edit then approve
              </Button>
            )}
          </>
        )}
        <Button variant="destructive" disabled={!!busy} onClick={() => submit("rejected")}>
          {busy === "rejected" ? "Rejecting…" : "Reject"}
        </Button>
      </div>
      {blocked && !editing && <p className="text-xs text-red-700">Blocked: cannot be approved as-is.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
