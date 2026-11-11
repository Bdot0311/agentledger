import Anthropic from "@anthropic-ai/sdk";
import type { ZodType, ZodTypeDef } from "zod";
import {
  JUDGE_FACTS_POLICY_ADDENDUM,
  JUDGE_FACTS_POLICY_PROMPT,
  JUDGE_REGULATORY_PII_ADDENDUM,
  JUDGE_REGULATORY_PII_PROMPT,
  fill,
} from "./prompts";
import {
  FACTS_POLICY_JSON_SCHEMA,
  REGULATORY_PII_JSON_SCHEMA,
  factsPolicyOutput,
  regulatoryPiiOutput,
  type FactsPolicyOutput,
  type RegulatoryPiiOutput,
} from "./schema";
import type { Judge, FactsPolicyInput, RegulatoryPiiInput } from "./types";

export const JUDGE_MODEL = process.env.JUDGE_MODEL || "claude-opus-5-5";
export const JUDGE_MODEL_FAST = process.env.JUDGE_MODEL_FAST || "claude-haiku-5-5";

// Models that support the server-side refusal fallback (Haiku has none).
const SUPPORTS_FALLBACK = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5)/;

let client: Anthropic | null = null;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * One judge call. Determinism: current Claude models reject `temperature`, so
 * instead we pin the output to a JSON schema (structured outputs) and run at
 * low effort; the scoring rules themselves (min-of-checks, caps, severities)
 * are applied deterministically in code (see score.ts).
 */
async function callJudge<T>(model: string, system: string, user: string, jsonSchema: object, parser: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  const fallback = SUPPORTS_FALLBACK.test(model);
  const res = await anthropic().beta.messages.create({
    model,
    max_tokens: 8000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort: "low", format: { type: "json_schema", schema: jsonSchema as Record<string, unknown> } },
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  if (res.stop_reason === "refusal") throw new Error("Judge declined to evaluate this message");
  if (res.stop_reason === "max_tokens") throw new Error("Judge output truncated");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return parser.parse(JSON.parse(text));
}

function factsPolicyUserMessage(i: FactsPolicyInput): string {
  const rules = i.policies.length ? i.policies.map((p, n) => `[P${n + 1}] ${p.rule_text}`).join("\n") : "(no active policy rules)";
  return [
    `<email>\nSubject: ${i.subject ?? "(none)"}\n\n${i.body}\n</email>`,
    `<fact_sheet version="${i.factSheetVersion ?? "none"}">\n${i.factSheet || "(no fact sheet has been written; treat every specific factual claim as unverified)"}\n</fact_sheet>`,
    `<policy_rules>\n${rules}\n</policy_rules>`,
  ].join("\n\n");
}

function regulatoryUserMessage(i: RegulatoryPiiInput): string {
  const parts = [
    `<email>\nTo: ${i.recipientEmail}\nSubject: ${i.subject ?? "(none)"}\n\n${i.body}\n</email>`,
    `<recipient_consent_status>${i.consentStatus}</recipient_consent_status>`,
  ];
  if (i.physicalAddress) {
    parts.push(
      `<can_spam_requirements>The sender has configured a physical postal address; CAN-SPAM requires it in every commercial email. Fail regulatory if the email does not include a postal address. Configured address: ${i.physicalAddress}</can_spam_requirements>`,
    );
  }
  return parts.join("\n\n");
}

export const claudeJudge: Judge = {
  model: `${JUDGE_MODEL}+${JUDGE_MODEL_FAST}`,
  factsPolicy: (i): Promise<FactsPolicyOutput> =>
    callJudge(
      JUDGE_MODEL,
      `${fill(JUDGE_FACTS_POLICY_PROMPT, { version: i.factSheetVersion ?? "none" })}\n\n${JUDGE_FACTS_POLICY_ADDENDUM}`,
      factsPolicyUserMessage(i),
      FACTS_POLICY_JSON_SCHEMA,
      factsPolicyOutput,
    ),
  regulatoryPii: (i): Promise<RegulatoryPiiOutput> =>
    callJudge(
      JUDGE_MODEL_FAST,
      `${fill(JUDGE_REGULATORY_PII_PROMPT, { consent_status: i.consentStatus })}\n\n${JUDGE_REGULATORY_PII_ADDENDUM}`,
      regulatoryUserMessage(i),
      REGULATORY_PII_JSON_SCHEMA,
      regulatoryPiiOutput,
    ),
};
