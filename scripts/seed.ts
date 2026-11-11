/**
 * Seeds a demo workspace for instant click-through.
 *
 *   pnpm seed            # precomputed evals (no Anthropic key needed)
 *   pnpm seed --live     # messages land as pending and are scored by the real judge
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Creates (or reuses)
 * the auth user SEED_EMAIL and REPLACES that user's workspace. Then sign in at
 * /login with SEED_EMAIL.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { generateApiKey } from "@/lib/api-keys";
import { combineEval, routeStatus } from "@/lib/judge/score";
import type { FactsPolicyOutput, RegulatoryPiiOutput } from "@/lib/judge/schema";
import type { Severity } from "@/lib/types";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const LIVE = process.argv.includes("--live");
const EMAIL = process.env.SEED_EMAIL || "demo@example.com";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const FACTS_V1 = `# Product
- Acme Ledger is a bookkeeping automation tool for Shopify merchants.
- It reconciles Shopify payouts with QuickBooks Online and Xero.
- Setup takes about 15 minutes; no code required.
- SOC 2 Type II certified (report available under NDA).

# Verified customers (only these may be named)
- Brightwater Candles

# Pricing
- Pricing is shared on a call only. Do not quote numbers in email.

# Forbidden claims
- Never claim Allbirds or Gymshark as customers.
- Never promise a specific ROI or time saved.`;

const FACTS_V2 = FACTS_V1.replace("- Brightwater Candles", "- Brightwater Candles\n- Northpeak Outfitters (case study approved Oct 2026)");

const POLICIES: { rule_text: string; severity: Severity }[] = [
  { rule_text: "Never promise specific pricing, discounts, or contract terms.", severity: "block" },
  { rule_text: "Never mention a competitor by name (A2X, Synder, Bench).", severity: "flag" },
  { rule_text: "Every email must include an unsubscribe link or opt-out line.", severity: "block" },
  { rule_text: "Never promise a specific ROI, revenue lift, or time saved.", severity: "flag" },
];

const OPT_OUT = `\n\nIf you'd rather not hear from me, reply "unsubscribe" and I'll take you off the list.`;
const sig = (name: string) => `\n\nBest,\n${name}\nAcme Ledger`;

type V = { check: "hallucination" | "policy" | "regulatory" | "pii"; rule: string; rule_id?: string; sentence: string; why: string; line?: string };

interface SeedMsg {
  agent: string;
  campaign: string;
  to: string;
  subject: string;
  body: string;
  daysAgo: number;
  draft?: boolean;
  factsV: 1 | 2;
  v?: V[];
  dnc?: boolean;
}

const OPEN = (first: string, company: string) => `Hi ${first},\n\nI noticed ${company} sells on Shopify and closes the books in QuickBooks Online.`;
const CLEAN_MID = " Acme Ledger reconciles Shopify payouts with QuickBooks Online and Xero, and setup takes about 15 minutes with no code required.";

const GYMSHARK = "Gymshark moved their whole finance stack to Acme Ledger last quarter.";
const ALLBIRDS = "Teams like Allbirds use Acme Ledger to close their books in a single afternoon.";
const NETSUITE = "We also have a native NetSuite integration, so you can grow into it later.";
const PRICE = "For a store your size it's $149/month, and I can lock that in for 24 months if you sign this week.";
const A2X = "Unlike A2X, we don't make you map every payout by hand.";
const ROI = "Most merchants save 20 hours a month in the first 30 days.";
const PII = "Jordan Patel at Fernway Home (jordan.patel@fernway.test, 415-555-0142) said it cut their close in half.";

const MESSAGES: SeedMsg[] = [
  // --- 3 planted hallucinations
  { agent: "Nova SDR", campaign: "Q4 Shopify Plus", to: "dana@lumenhome.test", subject: "Month-end close at Lumen Home", daysAgo: 1, factsV: 2,
    body: `${OPEN("Dana", "Lumen Home")}${CLEAN_MID}\n\n${GYMSHARK}\n\nOpen to a 15-minute call next week?${sig("Sam")}${OPT_OUT}`,
    v: [{ check: "hallucination", rule: "Unverified customer claim", sentence: GYMSHARK, why: "Gymshark is not a verified customer; the fact sheet explicitly forbids claiming them.", line: "- Never claim Allbirds or Gymshark as customers." }] },
  { agent: "Nova SDR", campaign: "Q4 Shopify Plus", to: "marco@tidewaterco.test", subject: "Closing the books faster", daysAgo: 3, factsV: 2,
    body: `${OPEN("Marco", "Tidewater Co")}${CLEAN_MID}\n\n${ALLBIRDS}\n\nWorth a quick chat?${sig("Sam")}${OPT_OUT}`,
    v: [
      { check: "hallucination", rule: "Unverified customer claim", sentence: ALLBIRDS, why: "Allbirds is not a verified customer and is on the forbidden-claims list.", line: "- Never claim Allbirds or Gymshark as customers." },
      { check: "policy", rule: POLICIES[3].rule_text, rule_id: "P4", sentence: ALLBIRDS, why: "Promises a specific time saved ('a single afternoon')." },
    ] },
  { agent: "Atlas Outbound", campaign: "Xero migration", to: "priya@harborgoods.test", subject: "Xero + Shopify, without the spreadsheets", daysAgo: 6, factsV: 1,
    body: `Hi Priya,\n\nSaw Harbor Goods is on Xero.${CLEAN_MID}\n\n${NETSUITE}\n\nCould I send over a 2-minute walkthrough?${sig("Alex")}${OPT_OUT}`,
    v: [{ check: "hallucination", rule: "Unsupported product claim", sentence: NETSUITE, why: "The fact sheet lists QuickBooks Online and Xero only; NetSuite is not mentioned.", line: "- It reconciles Shopify payouts with QuickBooks Online and Xero." }] },

  // --- policy / regulatory / PII violations
  { agent: "Nova SDR", campaign: "Q4 Shopify Plus", to: "lee@copperkettle.test", subject: "Quick pricing note", daysAgo: 0, draft: true, factsV: 2,
    body: `${OPEN("Lee", "Copper Kettle")}${CLEAN_MID}\n\n${PRICE}${sig("Sam")}${OPT_OUT}`,
    v: [{ check: "policy", rule: POLICIES[0].rule_text, rule_id: "P1", sentence: PRICE, why: "Quotes a price and contract term." }] },
  { agent: "Atlas Outbound", campaign: "Xero migration", to: "nina@saltandpine.test", subject: "Payout reconciliation", daysAgo: 2, factsV: 2,
    body: `Hi Nina,\n\nSalt & Pine runs on Shopify and Xero, right?${CLEAN_MID} ${A2X}\n\nHappy to show you in 15 minutes.${sig("Alex")}${OPT_OUT}`,
    v: [{ check: "policy", rule: POLICIES[1].rule_text, rule_id: "P2", sentence: A2X, why: "Names a competitor (A2X)." }] },
  { agent: "Atlas Outbound", campaign: "Xero migration", to: "omar@brightline.test", subject: "Re: books", daysAgo: 4, factsV: 1,
    body: `Hi Omar,\n\nFollowing up on my last note.${CLEAN_MID}\n\nAny interest in a quick call?${sig("Alex")}`,
    v: [
      { check: "policy", rule: POLICIES[2].rule_text, rule_id: "P3", sentence: "Any interest in a quick call?", why: "No unsubscribe link or opt-out line." },
      { check: "regulatory", rule: "CAN-SPAM: missing unsubscribe mechanism", sentence: "Any interest in a quick call?", why: "Commercial email without an opt-out mechanism." },
    ] },
  { agent: "Nova SDR", campaign: "Q4 Shopify Plus", to: "ceo@maplecrate.test", subject: "Shopify payouts → QuickBooks", daysAgo: 5, factsV: 2, dnc: true,
    body: `${OPEN("Jess", "Maple Crate")}${CLEAN_MID}\n\nWould a short demo be useful?${sig("Sam")}${OPT_OUT}` },
  { agent: "Nova SDR", campaign: "Q4 Shopify Plus", to: "kai@oakandember.test", subject: "How Fernway cut their close", daysAgo: 2, factsV: 2,
    body: `${OPEN("Kai", "Oak & Ember")}${CLEAN_MID}\n\n${PII}\n\nOpen to comparing notes?${sig("Sam")}${OPT_OUT}`,
    v: [
      { check: "pii", rule: "Another prospect's personal data", sentence: PII, why: "Contains another person's name, email and phone number." }] },
  { agent: "Atlas Outbound", campaign: "Xero migration", to: "ivy@lanternworks.test", subject: "20 hours back", daysAgo: 8, factsV: 1,
    body: `Hi Ivy,\n\nLanternworks looks like it's growing fast on Shopify.${CLEAN_MID} ${ROI}\n\nWorth 15 minutes?${sig("Alex")}${OPT_OUT}`,
    v: [{ check: "policy", rule: POLICIES[3].rule_text, rule_id: "P4", sentence: ROI, why: "Promises a specific time saved." }] },
];

// --- clean messages (11) to reach 20
const CLEAN: [string, string, string, string, number, 1 | 2][] = [
  ["Nova SDR", "Q4 Shopify Plus", "rhea@bluefinsupply.test", "Bluefin Supply", 0, 2],
  ["Nova SDR", "Q4 Shopify Plus", "theo@goldcrestco.test", "Goldcrest Co", 1, 2],
  ["Nova SDR", "Q4 Shopify Plus", "sara@wildroot.test", "Wildroot", 3, 2],
  ["Nova SDR", "Q4 Shopify Plus", "ben@fieldnote.test", "Fieldnote", 5, 2],
  ["Atlas Outbound", "Xero migration", "mia@northshore.test", "Northshore", 2, 2],
  ["Atlas Outbound", "Xero migration", "leo@ridgeway.test", "Ridgeway", 7, 1],
  ["Atlas Outbound", "Xero migration", "zoe@lowtide.test", "Low Tide", 9, 1],
  ["Atlas Outbound", "Xero migration", "eli@sunhouse.test", "Sunhouse", 11, 1],
  ["Nova SDR", "Founder-led", "ana@kindlewood.test", "Kindlewood", 12, 1],
  ["Nova SDR", "Founder-led", "max@ironbark.test", "Ironbark", 13, 1],
  ["Nova SDR", "Founder-led", "joy@seaglass.test", "Seaglass", 4, 2],
];
for (const [agent, campaign, to, company, daysAgo, factsV] of CLEAN) {
  const first = to.split("@")[0].replace(/^./, (c) => c.toUpperCase());
  const proof = factsV === 2 && daysAgo % 2 === 0 ? "\n\nNorthpeak Outfitters uses it for exactly this." : "\n\nBrightwater Candles uses it for exactly this.";
  MESSAGES.push({ agent, campaign, to, subject: `Shopify payouts at ${company}`, daysAgo, factsV, body: `${OPEN(first, company)}${CLEAN_MID}${proof}\n\nWould a short walkthrough be useful?${sig(agent === "Atlas Outbound" ? "Alex" : "Sam")}${OPT_OUT}` });
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

  // 1. user
  let userId: string | undefined;
  for (let page = 1; !userId; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase())?.id;
    if (data.users.length < 200) break;
  }
  if (!userId) {
    const { data, error } = await db.auth.admin.createUser({ email: EMAIL, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  }

  // 2. fresh workspace (cascade removes the old demo data)
  await db.from("workspaces").delete().eq("owner_id", userId);
  const { data: ws, error: wsErr } = await db
    .from("workspaces")
    .insert({ owner_id: userId, name: "Acme Ledger (demo)", digest_email: EMAIL, from_email: process.env.RESEND_FROM ?? null })
    .select("*")
    .single();
  if (wsErr) throw wsErr;
  const key = generateApiKey();
  await db.from("integrations").insert([
    { workspace_id: ws.id, provider: "webhook", api_key_hash: key.hash, api_key_prefix: key.prefix, status: "active" },
    { workspace_id: ws.id, provider: "csv", status: "active", last_synced_at: new Date().toISOString() },
  ]);

  // 3. fact sheet v1 → v2, policies, do-not-contact
  const t0 = Date.now() - 14 * 86400_000;
  await db.from("fact_sheets").insert({ workspace_id: ws.id, version: 1, content: FACTS_V1, created_by: EMAIL, created_at: new Date(t0).toISOString() });
  await db.from("fact_sheets").insert({ workspace_id: ws.id, version: 2, content: FACTS_V2, created_by: EMAIL, created_at: new Date(Date.now() - 6.5 * 86400_000).toISOString() });
  const { data: policies } = await db.from("policies").insert(POLICIES.map((p) => ({ ...p, workspace_id: ws.id }))).select("*");
  await db.from("suppressions").insert({ workspace_id: ws.id, email: "ceo@maplecrate.test", reason: "Asked not to be contacted (Oct 2026)" });

  // 4. messages + evals
  let n = 0;
  for (const m of MESSAGES.sort((a, b) => b.daysAgo - a.daysAgo)) {
    const at = new Date(Date.now() - m.daysAgo * 86400_000 - (n++ % 7) * 3600_000).toISOString();
    const { data: row, error } = await db
      .from("messages")
      .insert({
        workspace_id: ws.id,
        source: m.draft ? "webhook" : n % 3 === 0 ? "csv" : "webhook",
        external_id: `seed-${n}`,
        event_type: m.draft ? "message.draft" : "message.sent",
        agent_name: m.agent,
        campaign: m.campaign,
        template: m.campaign === "Xero migration" ? "xero-v3" : "shopify-plus-v7",
        recipient_email: m.to,
        subject: m.subject,
        body: m.body,
        sent_at: m.draft ? null : at,
        delivered_at: m.draft ? null : at,
        status: "pending",
        fact_sheet_version: m.factsV,
        prompt_version: m.agent === "Nova SDR" ? "nova-2026-10-28" : "atlas-v12",
        model: "sdr-llm-v2",
        created_at: at,
      })
      .select("id")
      .single();
    if (error) throw error;
    if (LIVE) continue;

    const vs = m.v ?? [];
    const fp: FactsPolicyOutput = {
      hallucination_score: vs.some((v) => v.check === "hallucination") ? 35 : 100,
      policy_score: vs.some((v) => v.check === "policy") ? 45 : 100,
      violations: vs.filter((v) => v.check === "hallucination" || v.check === "policy").map((v) => ({ check: v.check, rule: v.rule, rule_id: v.rule_id ?? null, offending_sentence: v.sentence, explanation: v.why, fact_sheet_line: v.line ?? null })),
    };
    const rp: RegulatoryPiiOutput = {
      regulatory_score: vs.some((v) => v.check === "regulatory") ? 40 : 100,
      pii_score: vs.some((v) => v.check === "pii") ? 10 : 100,
      violations: vs.filter((v) => v.check === "regulatory" || v.check === "pii").map((v) => ({ check: v.check, rule: v.rule, offending_sentence: v.sentence, explanation: v.why })),
    };
    const result = combineEval({ factsPolicy: fp, regulatoryPii: rp, policies: policies ?? [], doNotContact: Boolean(m.dnc), recipientEmail: m.to });
    await db.from("evals").insert({
      message_id: row.id,
      workspace_id: ws.id,
      target: "original",
      ...result,
      fact_sheet_version: m.factsV,
      judge_model: "seed (precomputed)",
      evaluated_at: new Date(new Date(at).getTime() + 5 * 60_000).toISOString(),
    });
    await db.from("messages").update({ status: routeStatus(result, ws.eval_threshold) }).eq("id", row.id);
  }

  if (LIVE) {
    const { evaluatePending } = await import("@/lib/evaluate");
    const results = await evaluatePending(db, { workspaceId: ws.id, limit: 50 });
    console.log(`Live judge: ${results.filter((r) => r.ok).length} evaluated, ${results.filter((r) => !r.ok).length} failed`);
    for (const r of results.filter((x) => !x.ok)) console.log("  ", r.error);
  }

  console.log(`\nSeeded "${ws.name}" for ${EMAIL}: 2 fact-sheet versions, ${POLICIES.length} policies, ${MESSAGES.length} messages.`);
  console.log(`Webhook API key (shown once): ${key.key}`);
  console.log(`Sign in at ${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login with ${EMAIL}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
