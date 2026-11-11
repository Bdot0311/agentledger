export type Severity = "block" | "flag";
export type CheckName = "hallucination" | "policy" | "regulatory" | "pii";
export type MessageSource = "gmail" | "webhook" | "csv";
export type MessageStatus = "pending" | "sent" | "blocked" | "flagged" | "approved" | "rejected" | "received";
export type EventType = "message.sent" | "message.draft" | "followup.sent" | "reply.received";

export interface Workspace {
  id: string;
  owner_id: string;
  name: string;
  timezone: string;
  eval_threshold: number;
  from_email: string | null;
  physical_address: string | null;
  digest_enabled: boolean;
  digest_email: string | null;
  created_at: string;
}

export interface FactSheet {
  id: string;
  workspace_id: string;
  version: number;
  content: string;
  created_by: string | null;
  created_at: string;
}

export interface Policy {
  id: string;
  workspace_id: string;
  rule_text: string;
  severity: Severity;
  active: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  workspace_id: string;
  source: MessageSource;
  external_id: string | null;
  event_type: EventType;
  agent_name: string;
  campaign: string | null;
  template: string | null;
  recipient_email: string;
  subject: string | null;
  body: string;
  sent_at: string | null;
  delivered_at: string | null;
  status: MessageStatus;
  fact_sheet_version: number | null;
  prompt_version: string | null;
  model: string | null;
  created_at: string;
}

export interface Violation {
  check: CheckName;
  rule: string;
  offending_sentence: string;
  explanation: string;
  severity: Severity;
  /** Fact-sheet line the claim contradicts, when the judge can point to one. */
  fact_sheet_line?: string | null;
}

export interface EvalRow {
  id: string;
  message_id: string;
  workspace_id: string;
  target: "original" | "edited";
  score: number;
  hallucination_score: number;
  policy_score: number;
  regulatory_score: number;
  pii_score: number;
  violations: Violation[];
  has_block: boolean;
  fact_sheet_version: number | null;
  judge_model: string;
  evaluated_at: string;
}

/** Row of the `message_ledger` view: message + latest eval + latest approval. */
export interface LedgerRow extends Message {
  eval_id: string | null;
  score: number | null;
  hallucination_score: number | null;
  policy_score: number | null;
  regulatory_score: number | null;
  pii_score: number | null;
  violations: Violation[] | null;
  has_block: boolean | null;
  judge_model: string | null;
  evaluated_at: string | null;
  eval_target: "original" | "edited" | null;
  decision: "approved" | "rejected" | "edited" | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}
