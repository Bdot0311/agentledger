import type { SupabaseClient } from "@supabase/supabase-js";
import { toCsv } from "@/lib/csv";
import type { LedgerRow } from "@/lib/types";

export interface LedgerFilters {
  agent?: string;
  status?: string;
  minScore?: number;
  maxScore?: number;
  from?: string; // yyyy-mm-dd
  to?: string; // yyyy-mm-dd (inclusive)
}

export function parseLedgerFilters(sp: URLSearchParams | Record<string, string | undefined>): LedgerFilters {
  const get = (k: string) => (sp instanceof URLSearchParams ? sp.get(k) : sp[k]) || undefined;
  const num = (k: string) => {
    const v = get(k);
    return v !== undefined && !Number.isNaN(Number(v)) ? Number(v) : undefined;
  };
  return { agent: get("agent"), status: get("status"), minScore: num("min_score"), maxScore: num("max_score"), from: get("from"), to: get("to") };
}

// Minimal structural type for the PostgREST builder methods we use.
interface Filterable<T> {
  eq(col: string, v: unknown): T;
  gte(col: string, v: unknown): T;
  lte(col: string, v: unknown): T;
  lt(col: string, v: unknown): T;
}

export function applyLedgerFilters<T extends Filterable<T>>(q: T, f: LedgerFilters): T {
  if (f.agent) q = q.eq("agent_name", f.agent);
  if (f.status) q = q.eq("status", f.status);
  if (f.minScore !== undefined) q = q.gte("score", f.minScore);
  if (f.maxScore !== undefined) q = q.lte("score", f.maxScore);
  if (f.from) q = q.gte("created_at", new Date(f.from).toISOString());
  if (f.to) {
    const end = new Date(f.to);
    end.setUTCDate(end.getUTCDate() + 1);
    q = q.lt("created_at", end.toISOString());
  }
  return q;
}

/** Reads every matching ledger row (pages through PostgREST's row cap). */
export async function fetchAllLedgerRows(db: SupabaseClient, workspaceId: string, f: LedgerFilters): Promise<LedgerRow[]> {
  const out: LedgerRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const q = applyLedgerFilters(db.from("message_ledger").select("*").eq("workspace_id", workspaceId), f)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as LedgerRow[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export const LEDGER_CSV_COLUMNS = [
  "id",
  "created_at",
  "source",
  "event_type",
  "external_id",
  "agent_name",
  "campaign",
  "template",
  "recipient_email",
  "subject",
  "body",
  "sent_at",
  "delivered_at",
  "status",
  "fact_sheet_version",
  "prompt_version",
  "model",
  "eval_id",
  "score",
  "hallucination_score",
  "policy_score",
  "regulatory_score",
  "pii_score",
  "has_block",
  "judge_model",
  "evaluated_at",
  "violations",
  "decision",
  "decided_by",
  "decided_at",
  "decision_note",
] as const;

export function ledgerToCsv(rows: LedgerRow[]): string {
  const body = rows.map((r) =>
    LEDGER_CSV_COLUMNS.map((c) => {
      const v = (r as unknown as Record<string, unknown>)[c];
      if (c === "violations") return v ? JSON.stringify(v) : "";
      return v as string | number | boolean | null;
    }),
  );
  return toCsv([[...LEDGER_CSV_COLUMNS], ...body]) + "\r\n";
}
