"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const origin = window.location.origin;
    const redirect = `${origin}/auth/callback?next=${encodeURIComponent(next ?? (mode === "signup" ? "/onboarding" : "/app"))}`;
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirect, shouldCreateUser: true },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else setState("sent");
  }

  if (state === "sent") {
    return (
      <p className="text-sm">
        Check <strong>{email}</strong> for a sign-in link. You can close this tab.
      </p>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
      </div>
      <Button type="submit" className="w-full" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : mode === "signup" ? "Start free" : "Email me a sign-in link"}
      </Button>
      {state === "error" && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
