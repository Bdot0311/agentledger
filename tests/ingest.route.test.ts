import { describe, expect, it, vi } from "vitest";
import { hashApiKey } from "@/lib/api-keys";

const GOOD = "al_live_good-key";
const ingested = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    let hash: unknown;
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => ((col === "api_key_hash" ? (hash = v) : null), q),
      maybeSingle: async () => ({ data: hash === hashApiKey(GOOD) ? { workspace_id: "ws" } : null }),
    };
    return { from: () => q };
  },
}));
vi.mock("@/lib/ingest", async (orig) => ({
  ...(await orig<typeof import("@/lib/ingest")>()),
  ingestMessages: async (...args: unknown[]) => (ingested.calls.push(args), { inserted: [{ id: "m1", external_id: null, status: "pending" }], duplicates: 0 }),
}));
vi.mock("@/lib/evaluate", () => ({ evaluateMessage: async () => ({}) }));

const { POST } = await import("@/app/api/ingest/route");
const payload = { event: "message.sent", agent_name: "bot", recipient_email: "dana@x.io", subject: "Hi", body: "Hello" };
const call = (headers: Record<string, string>, body: unknown = payload) =>
  POST(new Request("http://test/api/ingest", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

describe("POST /api/ingest", () => {
  it("401 without a key", async () => {
    expect((await call({})).status).toBe(401);
  });
  it("401 with a bad key", async () => {
    expect((await call({ authorization: "Bearer al_live_wrong" })).status).toBe(401);
    expect(ingested.calls).toHaveLength(0);
  });
  it("202 with a valid key (Bearer or x-api-key), scoped to the key's workspace", async () => {
    expect((await call({ authorization: `Bearer ${GOOD}` })).status).toBe(202);
    expect((await call({ "x-api-key": GOOD })).status).toBe(202);
    expect(ingested.calls[0][1]).toBe("ws");
  });
  it("400 on an invalid payload", async () => {
    expect((await call({ authorization: `Bearer ${GOOD}` }, { body: "no recipient" })).status).toBe(400);
  });
});
