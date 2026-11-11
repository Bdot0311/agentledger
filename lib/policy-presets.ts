import type { Severity } from "@/lib/types";

export const STARTER_POLICIES: { rule_text: string; severity: Severity }[] = [
  { rule_text: "Never promise specific pricing, discounts, or contract terms.", severity: "block" },
  { rule_text: "Never mention a competitor by name.", severity: "flag" },
  { rule_text: "Every email must include an unsubscribe link or opt-out line.", severity: "block" },
];

export const FACT_SHEET_TEMPLATE = `# Product
- What we do: …
- Key features: …
- Integrations: …

# Verified customers (only these may be named)
- …

# Pricing (public)
- …

# Forbidden claims
- Never claim we have <X> as a customer.
- Never promise <Y>.
`;
