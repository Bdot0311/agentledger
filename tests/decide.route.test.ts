import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRICING_BLOCK, makeEval, makeMessage, memoryDeps } from "./memory-deps";

const harness = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("./memory-deps").memoryDeps> }));

vi.mock("@/lib/route-auth", () => ({
  sessionWorkspace: async () => ({ workspace: { id: "ws", from_email: "sales@acme.test" }, email: "founder@acme.test" }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/decide-deps", () => ({ supabaseDecideDeps: () => harness.current!.deps }));

const { POST } = await import("@/app/api/approvals/[id]/decide/route");

const call = (body: unknown) =>
  POST(new Request("http://test/api/approvals/m1/decide", { method: "POST", body: JSON.stringify(body) }), { params: { id: "m1" } });

describe("POST /api/approvals/[id]/decide", () => {
  beforeEach(() => {
    harness.current = memoryDeps(makeMessage(), makeEval([PRICING_BLOCK]));
  });

  it("rejects a direct approve of a blocked message with 409", async () => {
    const res = await call({ decision: "approved" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Blocked/);
    expect(harness.current!.state.sent).toHaveLength(0);
  });

  it("400s on an invalid decision", async () => {
    const res = await call({ decision: "send-anyway" });
    expect(res.status).toBe(400);
  });
});
