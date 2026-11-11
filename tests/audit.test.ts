import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "@/lib/csv";
import { LEDGER_CSV_COLUMNS, ledgerToCsv } from "@/lib/ledger";
import type { LedgerRow } from "@/lib/types";
import { PRICING_BLOCK, makeMessage } from "./memory-deps";

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? routeFiles(p) : f === "route.ts" ? [p] : [];
  });
}

describe("audit log is append-only", () => {
  it("no API route exposes PUT, PATCH or DELETE", () => {
    for (const file of routeFiles(path.resolve("app/api"))) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/export\s+(async\s+)?function\s+(PUT|PATCH|DELETE)\b/);
    }
  });

  it("no code path deletes audit rows (messages, evals, approvals, fact sheets)", () => {
    const files = [...routeFiles(path.resolve("app")), path.resolve("app/actions.ts"), ...readdirSync("lib").filter((f) => f.endsWith(".ts")).map((f) => path.resolve("lib", f))];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/from\("(messages|evals|approvals|fact_sheets|digest_runs)"\)\s*\.\s*delete/);
      expect(src, file).not.toMatch(/from\("(evals|approvals|fact_sheets|digest_runs)"\)\s*\.\s*(update|upsert)/);
    }
  });

  it("the migration rejects UPDATE/DELETE on audit tables at the database level", () => {
    const sql = readFileSync("supabase/migrations/0001_init.sql", "utf8");
    for (const t of ["fact_sheets", "evals", "approvals", "digest_runs"]) {
      expect(sql).toMatch(new RegExp(`before update or delete on public\\.${t}`));
    }
    expect(sql).toMatch(/messages_no_delete before delete on public\.messages/);
    expect(sql).toMatch(/message content is immutable/);
  });
});

describe("CSV export", () => {
  it("round-trips every column of every row, including commas, quotes and newlines", () => {
    const tricky = 'Hi "Dana",\nPricing: $49/mo, billed yearly.\r\nThanks';
    const rows: LedgerRow[] = [0, 1, 2].map((i) => ({
      ...makeMessage({ id: `m${i}`, body: i === 1 ? tricky : `body ${i}`, subject: i === 2 ? "a, b" : "s" }),
      eval_id: `e${i}`,
      score: 40 + i,
      hallucination_score: 100,
      policy_score: 40,
      regulatory_score: 100,
      pii_score: 100,
      violations: [PRICING_BLOCK],
      has_block: true,
      judge_model: "stub",
      evaluated_at: "2026-11-01T00:00:00.000Z",
      eval_target: "original",
      decision: i === 0 ? "rejected" : null,
      decided_by: i === 0 ? "founder@acme.test" : null,
      decided_at: i === 0 ? "2026-11-02T00:00:00.000Z" : null,
      decision_note: null,
    }));
    const parsed = parseCsv(ledgerToCsv(rows));
    expect(parsed[0]).toEqual([...LEDGER_CSV_COLUMNS]);
    expect(parsed).toHaveLength(rows.length + 1);
    rows.forEach((r, i) => {
      const record = Object.fromEntries(LEDGER_CSV_COLUMNS.map((c, j) => [c, parsed[i + 1][j]]));
      expect(record.id).toBe(r.id);
      expect(record.body).toBe(r.body);
      expect(record.subject).toBe(r.subject);
      expect(Number(record.score)).toBe(r.score);
      expect(JSON.parse(record.violations)).toEqual(r.violations);
      expect(record.decided_by).toBe(r.decided_by ?? "");
    });
  });
});
