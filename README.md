# AgentLedger

The audit & eval layer for revenue agents. It captures every message your AI SDR sends, scores it against your fact sheet and rules, holds anything risky for approval, and keeps an append-only audit trail you can export.

Next.js 14 (App Router) · TypeScript · Tailwind + shadcn/ui · Supabase (Postgres, magic-link auth, RLS) · Anthropic Messages API · Resend · Vercel Cron.

## Quick start

```bash
pnpm install
cp .env.example .env.local        # fill in the values below
# Apply the schema: paste supabase/migrations/0001_init.sql into the Supabase SQL editor
#   (or `supabase db push` if you use the Supabase CLI)
pnpm seed                          # demo workspace for SEED_EMAIL (precomputed evals)
pnpm dev                           # http://localhost:3000 → /login with SEED_EMAIL
```

`pnpm seed --live` inserts the same 20 messages as pending and scores them with the real judge (needs `ANTHROPIC_API_KEY`).

### Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project. Add `{APP_URL}/auth/callback` to Auth → URL configuration → Redirect URLs. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. All writes go through it after the server authorizes the workspace. |
| `ANTHROPIC_API_KEY` | Server-only. Judge + digest writer. |
| `JUDGE_MODEL`, `JUDGE_MODEL_FAST` | Optional. Defaults: `claude-opus-5-5` (hallucination + policy), `claude-haiku-5-5` (regulatory + PII). Set both to the same model to run one model. |
| `RESEND_API_KEY`, `RESEND_FROM` | Sending approved messages and the digest. Without a key outside production, sends are recorded as `dry-run-…`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Gmail OAuth (Web client). Redirect URI: `{APP_URL}/api/integrations/gmail/callback`. Scope: `gmail.readonly`. |
| `CRON_SECRET` | Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Required in production. |
| `NEXT_PUBLIC_APP_URL` | Public base URL (OAuth redirect, links in emails). |

## How it works

**Ingest** (`lib/ingest.ts`) — Gmail (sent mail carrying a label, default `AI SDR`), CSV upload, or `POST /api/ingest`. Each message becomes an audit record stamped with the fact-sheet version current at ingest time.

```bash
curl -X POST $APP_URL/api/ingest \
  -H "Authorization: Bearer al_live_…" -H "Content-Type: application/json" \
  -d '{"event":"message.draft","agent_name":"nova","campaign":"q4","recipient_email":"dana@prospect.com","subject":"Hi","body":"…"}'
```

Events: `message.sent`, `followup.sent`, `reply.received` (logged, not scored), and `message.draft` — the pre-send gate: a draft is only delivered (via Resend) once it passes, or once a human approves it. Add `?sync=1` (≤ 5 messages) to get verdicts in the response; batch with `{"messages":[…]}` (≤ 100).

**Eval** (`lib/evaluate.ts`, `lib/judge/*`) — two judge passes run in parallel using the verbatim prompts in `lib/judge/prompts.ts`, with structured outputs so the response is always valid JSON. `lib/judge/score.ts` then applies the rules deterministically:
- overall score = lowest of hallucination / policy / regulatory / PII
- a check with any violation is capped at 69
- policy violations inherit the rule's severity; PII leaks and do-not-contact recipients are always **block**
- block → `blocked`; below threshold or any violation → `flagged` (queue); otherwise `sent`

**Gate** (`lib/send.ts`, `lib/decide.ts`) — the only send path is `POST /api/approvals/[messageId]/decide`. `approved` re-reads the stored eval and refuses (409) any block-severity violation, whatever the message's status says. `edited` re-evaluates the new body and applies the same gate. `rejected` never sends.

**Audit** — `fact_sheets`, `evals`, `approvals`, `digest_runs` reject UPDATE/DELETE via triggers; `messages` rejects DELETE and any change to content (only `status`/`delivered_at` change). No API route exposes PUT/PATCH/DELETE. `/api/export?format=csv|json` takes the same filters as the log page; JSON includes every eval, every decision and the referenced fact-sheet versions.

**Crons** (`vercel.json`) — `/api/cron/eval` every 15 min (Gmail sync + up to 50 pending evals). `/api/cron/digest` hourly; sends to each workspace when it's Monday 8am in its timezone, at most once per 6 days, skipping weeks with no messages. Hourly crons need a Vercel Pro plan; on Hobby, schedule the digest at a fixed UTC hour and call it with `?force=1`.

## Tests

```bash
pnpm test                                  # 38 deterministic tests
ANTHROPIC_API_KEY=… pnpm test judge.live   # live judge: planted hallucination + clean message
pnpm build                                 # typecheck + lint + build
```

| Acceptance criterion | Where it's verified |
|---|---|
| Gmail connect → scored messages on the dashboard | Manual, with a test Gmail account: connect → callback imports right away → "Evaluate pending now" in Settings (or wait for the cron) |
| Planted hallucination scores below threshold, lands in queue, exact sentence cited | `tests/judge.live.test.ts` (live), `tests/score.test.ts` (pipeline) |
| Clean message scores 100 with no violations | `tests/judge.live.test.ts` |
| Block violation can't be sent, even via a direct API call | `tests/decide.test.ts`, `tests/decide.route.test.ts` |
| Audit log append-only; export matches the DB | `tests/audit.test.ts`; triggers checked against Postgres 16 |
| Webhook: valid key works, bad key → 401 | `tests/ingest.route.test.ts` |
| Fact-sheet versioning; old messages keep their version | `tests/facts-ingest.test.ts` |
| `pnpm build` passes, zero TS errors | `pnpm build` |

## Where this differs from the spec

- **Judge temperature.** Current Claude models reject `temperature` (400). Scoring is made repeatable by pinning output to a JSON schema, running at low effort, and doing every scoring decision (min, caps, severities, routing) in code.
- **Extra statuses.** `pending` (ingested, not yet scored) and `received` (inbound reply) were added to `messages.status`.
- **Extra columns/tables.** `messages.event_type / external_id / campaign / template / delivered_at` (dedupe, per-campaign stats, the draft gate); `evals.target / has_block / workspace_id`; `approvals.edited_body / send_id`; `suppressions` (do-not-contact list); `integration_secrets` (Gmail refresh tokens, readable by the service role only); workspace settings columns (from-address, postal address, digest).
- **Edit-then-approve** stores the edited body on the approval and a new `edited` eval; the original message body is never changed.
- **Blocked messages that were already sent** (Gmail/CSV imports) can only be rejected (acknowledged), not approved.
