import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/utils";
import { ingestMessages, ingestMessageSchema, type ParsedIngestMessage } from "@/lib/ingest";

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
export const DEFAULT_GMAIL_LABEL = "AI SDR";

export const gmailRedirectUri = () => appUrl("/api/integrations/gmail/callback");

export function gmailAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: gmailRedirectUri(),
    response_type: "code",
    scope: `${SCOPE} openid email`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google token error: ${json.error_description ?? json.error ?? res.status}`);
  return json;
}

export async function exchangeGmailCode(code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: gmailRedirectUri() });
  const profile = await gmailFetch<{ emailAddress: string }>(t.access_token!, "/profile");
  return { refreshToken: t.refresh_token ?? null, accessToken: t.access_token!, email: profile.emailAddress };
}

async function gmailFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL}${path}`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

function extractBody(part: GmailPart): string {
  const plain = findPart(part, "text/plain");
  if (plain?.body?.data) return b64url(plain.body.data);
  const html = findPart(part, "text/html");
  if (html?.body?.data) return htmlToText(b64url(html.body.data));
  return part.body?.data ? b64url(part.body.data) : "";
}

function findPart(part: GmailPart, mime: string): GmailPart | null {
  if (part.mimeType === mime && part.body?.data) return part;
  for (const p of part.parts ?? []) {
    const f = findPart(p, mime);
    if (f) return f;
  }
  return null;
}

/** Keeps link targets visible (so "unsubscribe" links survive) and strips tags. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function header(part: GmailPart, name: string) {
  return part.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function firstAddress(to: string | null): string | null {
  if (!to) return null;
  const m = to.match(/<([^>]+)>/) ?? to.match(/([^\s,;]+@[^\s,;]+)/);
  return m ? m[1].trim().toLowerCase() : null;
}

/**
 * Imports sent messages carrying the configured label. Re-running is safe:
 * messages dedupe on the Gmail message id.
 */
export async function syncGmailIntegration(db: SupabaseClient, integrationId: string, maxMessages = 50) {
  const { data: integ } = await db.from("integrations").select("*").eq("id", integrationId).single();
  const { data: secret } = await db.from("integration_secrets").select("refresh_token").eq("integration_id", integrationId).single();
  if (!integ || !secret) throw new Error("Gmail integration not found");

  const { access_token } = await tokenRequest({ refresh_token: secret.refresh_token, grant_type: "refresh_token" });
  const label = (integ.config?.label as string | undefined) || DEFAULT_GMAIL_LABEL;
  const after = integ.last_synced_at ? ` after:${Math.floor(new Date(integ.last_synced_at).getTime() / 1000) - 86400}` : " newer_than:30d";
  const q = encodeURIComponent(`in:sent label:"${label}"${after}`);
  const list = await gmailFetch<{ messages?: { id: string }[] }>(access_token!, `/messages?q=${q}&maxResults=${maxMessages}`);

  const items: ParsedIngestMessage[] = [];
  for (const { id } of list.messages ?? []) {
    const msg = await gmailFetch<{ id: string; internalDate: string; payload: GmailPart }>(access_token!, `/messages/${id}?format=full`);
    const recipient = firstAddress(header(msg.payload, "To"));
    const body = extractBody(msg.payload);
    if (!recipient || !body) continue;
    const parsed = ingestMessageSchema.safeParse({
      event: "message.sent",
      external_id: msg.id,
      agent_name: label,
      recipient_email: recipient,
      subject: header(msg.payload, "Subject"),
      body,
      sent_at: new Date(Number(msg.internalDate)).toISOString(),
    });
    if (parsed.success) items.push(parsed.data);
  }
  const result = await ingestMessages(db, integ.workspace_id, "gmail", items);
  await db.from("integrations").update({ last_synced_at: new Date().toISOString(), status: "active" }).eq("id", integrationId);
  return result;
}
