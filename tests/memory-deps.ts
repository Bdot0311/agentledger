import type { DecideDeps } from "@/lib/decide";
import type { EvalRow, Message, Violation } from "@/lib/types";

export function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    workspace_id: "ws",
    source: "webhook",
    external_id: null,
    event_type: "message.draft",
    agent_name: "sdr-bot",
    campaign: null,
    template: null,
    recipient_email: "dana@lumenhome.test",
    subject: "Hi",
    body: "Our plan is $49/mo, locked for 3 years.",
    sent_at: null,
    delivered_at: null,
    status: "blocked",
    fact_sheet_version: 1,
    prompt_version: null,
    model: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeEval(violations: Violation[], overrides: Partial<EvalRow> = {}): EvalRow {
  return {
    id: "e" + Math.random(),
    message_id: "m1",
    workspace_id: "ws",
    target: "original",
    score: violations.length ? 40 : 100,
    hallucination_score: 100,
    policy_score: violations.length ? 40 : 100,
    regulatory_score: 100,
    pii_score: 100,
    violations,
    has_block: violations.some((v) => v.severity === "block"),
    fact_sheet_version: 1,
    judge_model: "stub",
    evaluated_at: new Date().toISOString(),
    ...overrides,
  };
}

export const PRICING_BLOCK: Violation = {
  check: "policy",
  rule: "Never promise specific pricing, discounts, or contract terms.",
  offending_sentence: "Our plan is $49/mo, locked for 3 years.",
  explanation: "Quotes a price.",
  severity: "block",
};

/** In-memory DecideDeps that records every side effect. */
export function memoryDeps(message: Message | null, latest: EvalRow | null, editedEval?: EvalRow) {
  const state = {
    message,
    approvals: [] as Parameters<DecideDeps["insertApproval"]>[0][],
    sent: [] as Parameters<DecideDeps["send"]>[0][],
    evaluatedBodies: [] as string[],
  };
  const deps: DecideDeps = {
    getMessage: async () => state.message,
    getLatestOriginalEval: async () => latest,
    evaluateEditedBody: async (_m, body) => {
      state.evaluatedBodies.push(body);
      return editedEval ?? makeEval([], { target: "edited" });
    },
    insertApproval: async (row) => void state.approvals.push(row),
    updateMessage: async (_id, patch) => void (state.message = { ...state.message!, ...patch }),
    send: async (email) => (state.sent.push(email), { id: "send_1", dryRun: false }),
    fromAddress: () => "sales@acme.test",
  };
  return { deps, state };
}
