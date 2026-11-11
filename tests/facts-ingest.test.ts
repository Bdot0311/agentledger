import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLatestFactSheet, saveFactSheetVersion } from "@/lib/facts";
import { ingestMessages, ingestMessageSchema } from "@/lib/ingest";
import { csvToRecords } from "@/lib/csv";
import { fakeDb } from "./fake-db";

const msg = (o: Record<string, unknown> = {}) =>
  ingestMessageSchema.parse({ recipient_email: "Dana@LumenHome.test", body: "Hi Dana", agent_name: "bot", ...o });

describe("fact-sheet versioning", () => {
  it("editing creates a new version and never overwrites the old one", async () => {
    const db = fakeDb();
    const c = db as unknown as SupabaseClient;
    expect(await saveFactSheetVersion(c, "ws", "v1 facts", "a@x")).toBe(1);
    expect(await saveFactSheetVersion(c, "ws", "v2 facts", "a@x")).toBe(2);
    expect(await saveFactSheetVersion(c, "ws", "v2 facts", "a@x")).toBe(2); // unchanged → no new version
    expect(db.tables.fact_sheets.map((f) => [f.version, f.content])).toEqual([
      [1, "v1 facts"],
      [2, "v2 facts"],
    ]);
    expect((await getLatestFactSheet(c, "ws"))?.version).toBe(2);
  });

  it("old messages keep the fact-sheet version current when they were ingested", async () => {
    const db = fakeDb();
    const c = db as unknown as SupabaseClient;
    await saveFactSheetVersion(c, "ws", "v1", null);
    await ingestMessages(c, "ws", "webhook", [msg({ external_id: "a" })]);
    await saveFactSheetVersion(c, "ws", "v2", null);
    await ingestMessages(c, "ws", "webhook", [msg({ external_id: "b" })]);
    const byId = Object.fromEntries(db.tables.messages.map((m) => [m.external_id, m.fact_sheet_version]));
    expect(byId).toEqual({ a: 1, b: 2 });
  });
});

describe("ingest", () => {
  it("normalizes, dedupes on external id, holds drafts and marks replies", async () => {
    const db = fakeDb();
    const c = db as unknown as SupabaseClient;
    const r1 = await ingestMessages(c, "ws", "webhook", [msg({ external_id: "1" }), msg({ external_id: "2", event: "message.draft" }), msg({ event: "reply.received" })]);
    const r2 = await ingestMessages(c, "ws", "webhook", [msg({ external_id: "1" })]);
    expect(r1.inserted).toHaveLength(3);
    expect(r2).toMatchObject({ inserted: [], duplicates: 1 });
    const [sent, draft, reply] = db.tables.messages;
    expect(sent).toMatchObject({ recipient_email: "dana@lumenhome.test", status: "pending" });
    expect(sent.delivered_at).toBeTruthy();
    expect(draft).toMatchObject({ status: "pending", delivered_at: null, sent_at: null });
    expect(reply.status).toBe("received");
  });

  it("do_not_contact adds the recipient to suppressions", async () => {
    const db = fakeDb();
    await ingestMessages(db as unknown as SupabaseClient, "ws", "csv", [msg({ do_not_contact: true })]);
    expect(db.tables.suppressions).toEqual([expect.objectContaining({ email: "dana@lumenhome.test" })]);
  });

  it("maps CSV headers and aliases to ingest records", () => {
    const records = csvToRecords('To,Subject,Body,Agent,DNC\n"Dana <x>",Hi,"Line 1\nLine 2",bot,yes\n');
    expect(records[0]).toEqual({ recipient_email: "Dana <x>", subject: "Hi", body: "Line 1\nLine 2", agent_name: "bot", do_not_contact: true });
    expect(ingestMessageSchema.safeParse({ ...records[0], recipient_email: "dana@x.io" }).success).toBe(true);
  });
});
