import { describe, expect, it } from "vitest";
import { decide } from "@/lib/decide";
import { assertSendable, SendRejectedError } from "@/lib/send";
import { PRICING_BLOCK, makeEval, makeMessage, memoryDeps } from "./memory-deps";

describe("block enforcement in the send path", () => {
  it("assertSendable refuses unevaluated and block-severity messages", () => {
    expect(() => assertSendable(null)).toThrow(SendRejectedError);
    expect(() => assertSendable(makeEval([PRICING_BLOCK]))).toThrow(/Blocked/);
    expect(() => assertSendable(makeEval([{ ...PRICING_BLOCK, severity: "flag" }]))).not.toThrow();
  });

  it("approving a blocked message is rejected with 409 and nothing is sent or recorded", async () => {
    const { deps, state } = memoryDeps(makeMessage(), makeEval([PRICING_BLOCK]));
    await expect(decide(deps, { messageId: "m1", decision: "approved", decidedBy: "founder@acme.test" })).rejects.toMatchObject({ status: 409 });
    expect(state.sent).toHaveLength(0);
    expect(state.approvals).toHaveLength(0);
    expect(state.message!.status).toBe("blocked");
  });

  it("refuses even if the message status was tampered to 'flagged' — the gate reads the eval", async () => {
    const { deps, state } = memoryDeps(makeMessage({ status: "flagged" }), makeEval([PRICING_BLOCK]));
    await expect(decide(deps, { messageId: "m1", decision: "approved", decidedBy: "x" })).rejects.toBeInstanceOf(SendRejectedError);
    expect(state.sent).toHaveLength(0);
  });

  it("edit-then-approve re-evaluates the edit; a still-blocked edit does not send", async () => {
    const { deps, state } = memoryDeps(makeMessage(), makeEval([PRICING_BLOCK]), makeEval([PRICING_BLOCK], { target: "edited" }));
    await expect(decide(deps, { messageId: "m1", decision: "edited", decidedBy: "x", editedBody: "Now $39/mo!" })).rejects.toMatchObject({ status: 409 });
    expect(state.evaluatedBodies).toEqual(["Now $39/mo!"]);
    expect(state.sent).toHaveLength(0);
  });

  it("a clean edit sends the edited body and logs who decided", async () => {
    const { deps, state } = memoryDeps(makeMessage(), makeEval([PRICING_BLOCK]));
    const r = await decide(deps, { messageId: "m1", decision: "edited", decidedBy: "founder@acme.test", editedBody: "Happy to share pricing on a call." });
    expect(r.status).toBe("approved");
    expect(state.sent[0].body).toBe("Happy to share pricing on a call.");
    expect(state.approvals[0]).toMatchObject({ decision: "edited", decided_by: "founder@acme.test", send_id: "send_1" });
    expect(state.message!.delivered_at).toBeTruthy();
  });

  it("approving a flagged (non-block) draft sends it once", async () => {
    const { deps, state } = memoryDeps(makeMessage({ status: "flagged" }), makeEval([{ ...PRICING_BLOCK, severity: "flag" }]));
    await decide(deps, { messageId: "m1", decision: "approved", decidedBy: "x" });
    expect(state.sent).toHaveLength(1);
    expect(state.message!.status).toBe("approved");
  });

  it("approving an already-delivered (Gmail/CSV) message records the decision without re-sending", async () => {
    const { deps, state } = memoryDeps(makeMessage({ status: "flagged", delivered_at: new Date().toISOString() }), makeEval([]));
    await decide(deps, { messageId: "m1", decision: "approved", decidedBy: "x" });
    expect(state.sent).toHaveLength(0);
    expect(state.approvals[0].decision).toBe("approved");
  });

  it("reject never sends", async () => {
    const { deps, state } = memoryDeps(makeMessage(), makeEval([PRICING_BLOCK]));
    await decide(deps, { messageId: "m1", decision: "rejected", decidedBy: "x", note: "off-brand" });
    expect(state.sent).toHaveLength(0);
    expect(state.message!.status).toBe("rejected");
  });

  it("only queued messages can be decided", async () => {
    const { deps } = memoryDeps(makeMessage({ status: "approved" }), makeEval([]));
    await expect(decide(deps, { messageId: "m1", decision: "approved", decidedBy: "x" })).rejects.toMatchObject({ status: 409 });
  });
});
