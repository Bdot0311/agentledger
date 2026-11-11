import type { FactsPolicyOutput, RegulatoryPiiOutput } from "./schema";
import type { Policy } from "@/lib/types";

export interface FactsPolicyInput {
  subject: string | null;
  body: string;
  factSheet: string;
  factSheetVersion: number | null;
  policies: Pick<Policy, "id" | "rule_text" | "severity">[];
}

export interface RegulatoryPiiInput {
  subject: string | null;
  body: string;
  recipientEmail: string;
  consentStatus: "opted_in_or_unknown" | "do_not_contact";
  physicalAddress: string | null;
}

/** Abstraction over the LLM so tests can stub it. */
export interface Judge {
  model: string;
  factsPolicy(input: FactsPolicyInput): Promise<FactsPolicyOutput>;
  regulatoryPii(input: RegulatoryPiiInput): Promise<RegulatoryPiiOutput>;
}
