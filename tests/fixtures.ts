import type { EvalContext } from "@/lib/evaluate";

export const FACT_SHEET = `# Product
- Acme Ledger is a bookkeeping automation tool for Shopify merchants.
- It reconciles Shopify payouts with QuickBooks Online and Xero.
- Setup takes about 15 minutes; no code required.
- SOC 2 Type II certified (report available under NDA).

# Verified customers (only these may be named)
- Brightwater Candles
- Northpeak Outfitters

# Pricing
- Pricing is shared on a call only. Do not quote numbers in email.

# Forbidden claims
- Never claim Allbirds or Gymshark as customers.
- Never promise a specific ROI or time saved.`;

export const POLICIES = [
  { id: "p1", rule_text: "Never promise specific pricing, discounts, or contract terms.", severity: "block" as const },
  { id: "p2", rule_text: "Never mention a competitor by name.", severity: "flag" as const },
  { id: "p3", rule_text: "Every email must include an unsubscribe link or opt-out line.", severity: "block" as const },
];

export const ctx = (overrides: Partial<EvalContext> = {}): EvalContext => ({
  workspace: { id: "ws", eval_threshold: 80, physical_address: null, from_email: "sales@acme.test" },
  factSheet: { content: FACT_SHEET, version: 3 },
  policies: POLICIES,
  doNotContact: false,
  ...overrides,
});

export const PLANTED_SENTENCE = "Gymshark switched to Acme Ledger last quarter and closes their books in a day now.";

export const HALLUCINATION_EMAIL = {
  subject: "Quick idea for your month-end close",
  recipient_email: "dana@lumenhome.test",
  body: `Hi Dana,

I noticed Lumen Home runs on Shopify and QuickBooks Online. Acme Ledger reconciles Shopify payouts with QuickBooks automatically, and setup takes about 15 minutes with no code.

${PLANTED_SENTENCE}

Open to a 15-minute call next week?

Best,
Sam

If you'd rather not hear from me, reply "unsubscribe" and I'll remove you.`,
};

export const CLEAN_EMAIL = {
  subject: "Shopify payouts → QuickBooks",
  recipient_email: "dana@lumenhome.test",
  body: `Hi Dana,

I noticed Lumen Home runs on Shopify. Acme Ledger reconciles Shopify payouts with QuickBooks Online and Xero, and setup takes about 15 minutes with no code required.

Brightwater Candles uses it today.

Would you be open to a quick call next week?

Best,
Sam

If you'd rather not hear from me, reply "unsubscribe" and I'll remove you.`,
};
