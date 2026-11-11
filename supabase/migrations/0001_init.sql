-- AgentLedger schema. Run in the Supabase SQL editor or with `supabase db push`.
-- All writes happen server-side with the service role after the server has
-- authorized the workspace. Authenticated users get read access to their own
-- workspace via RLS. Audit tables are append-only, enforced by triggers.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  timezone text not null default 'America/New_York',
  eval_threshold int not null default 80 check (eval_threshold between 0 and 100),
  from_email text,
  physical_address text,
  digest_enabled boolean not null default true,
  digest_email text,
  created_at timestamptz not null default now()
);
create unique index workspaces_owner_idx on public.workspaces (owner_id); -- MVP: one workspace per user

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null check (provider in ('gmail', 'webhook', 'csv')),
  account_id text,
  api_key_hash text,
  api_key_prefix text,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz
);
create unique index integrations_api_key_hash_idx on public.integrations (api_key_hash) where api_key_hash is not null;
create index integrations_workspace_idx on public.integrations (workspace_id);

-- OAuth tokens live in their own table with RLS on and no policies: service role only.
create table public.integration_secrets (
  integration_id uuid primary key references public.integrations (id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

create table public.fact_sheets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version int not null,
  content text not null,
  created_by text,
  created_at timestamptz not null default now(),
  unique (workspace_id, version)
);

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  rule_text text not null,
  severity text not null check (severity in ('block', 'flag')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Do-not-contact list. A suppressed recipient is an instant block.
create table public.suppressions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source text not null check (source in ('gmail', 'webhook', 'csv')),
  external_id text,
  event_type text not null default 'message.sent'
    check (event_type in ('message.sent', 'message.draft', 'followup.sent', 'reply.received')),
  agent_name text not null default 'unknown',
  campaign text,
  template text,
  recipient_email text not null,
  subject text,
  body text not null,
  sent_at timestamptz,
  delivered_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'blocked', 'flagged', 'approved', 'rejected', 'received')),
  fact_sheet_version int,
  prompt_version text,
  model text,
  created_at timestamptz not null default now()
);
create unique index messages_external_idx on public.messages (workspace_id, source, external_id) where external_id is not null;
create index messages_workspace_created_idx on public.messages (workspace_id, created_at desc);
create index messages_pending_idx on public.messages (status) where status = 'pending';

create table public.evals (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  target text not null default 'original' check (target in ('original', 'edited')),
  score int not null,
  hallucination_score int not null,
  policy_score int not null,
  regulatory_score int not null,
  pii_score int not null,
  violations jsonb not null default '[]'::jsonb,
  has_block boolean not null default false,
  fact_sheet_version int,
  judge_model text not null,
  evaluated_at timestamptz not null default now()
);
create index evals_message_idx on public.evals (message_id, evaluated_at desc);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected', 'edited')),
  decided_by text not null,
  note text,
  edited_body text,
  send_id text,
  decided_at timestamptz not null default now()
);
create index approvals_message_idx on public.approvals (message_id);

create table public.digest_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  sent_at timestamptz not null default now(),
  messages_sent int not null,
  messages_blocked int not null,
  avg_score int
);

-- ---------------------------------------------------------------- append-only enforcement
-- `pg_trigger_depth() = 0` lets ON DELETE CASCADE from workspace deletion through,
-- while any direct UPDATE/DELETE statement is rejected.

create or replace function public.reject_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'AgentLedger: % on % is not allowed (append-only audit record)', tg_op, tg_table_name;
end $$;

create trigger fact_sheets_append_only before update or delete on public.fact_sheets
  for each row when (pg_trigger_depth() = 0) execute function public.reject_mutation();
create trigger evals_append_only before update or delete on public.evals
  for each row when (pg_trigger_depth() = 0) execute function public.reject_mutation();
create trigger approvals_append_only before update or delete on public.approvals
  for each row when (pg_trigger_depth() = 0) execute function public.reject_mutation();
create trigger digest_runs_append_only before update or delete on public.digest_runs
  for each row when (pg_trigger_depth() = 0) execute function public.reject_mutation();

-- Messages: content is immutable. Only lifecycle fields may change.
create or replace function public.guard_message_update() returns trigger language plpgsql as $$
begin
  if (new.workspace_id, new.source, new.external_id, new.event_type, new.agent_name, new.campaign,
      new.template, new.recipient_email, new.subject, new.body, new.sent_at, new.fact_sheet_version,
      new.prompt_version, new.model, new.created_at)
     is distinct from
     (old.workspace_id, old.source, old.external_id, old.event_type, old.agent_name, old.campaign,
      old.template, old.recipient_email, old.subject, old.body, old.sent_at, old.fact_sheet_version,
      old.prompt_version, old.model, old.created_at) then
    raise exception 'AgentLedger: message content is immutable (only status/delivered_at may change)';
  end if;
  return new;
end $$;

create trigger messages_guard_update before update on public.messages
  for each row execute function public.guard_message_update();
create trigger messages_no_delete before delete on public.messages
  for each row when (pg_trigger_depth() = 0) execute function public.reject_mutation();

-- ---------------------------------------------------------------- RLS

alter table public.workspaces enable row level security;
alter table public.integrations enable row level security;
alter table public.integration_secrets enable row level security;
alter table public.fact_sheets enable row level security;
alter table public.policies enable row level security;
alter table public.suppressions enable row level security;
alter table public.messages enable row level security;
alter table public.evals enable row level security;
alter table public.approvals enable row level security;
alter table public.digest_runs enable row level security;

create or replace function public.is_workspace_owner(ws uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspaces w where w.id = ws and w.owner_id = auth.uid());
$$;

create policy "owner reads workspace" on public.workspaces for select using (owner_id = auth.uid());
create policy "owner reads integrations" on public.integrations for select using (public.is_workspace_owner(workspace_id));
create policy "owner reads fact sheets" on public.fact_sheets for select using (public.is_workspace_owner(workspace_id));
create policy "owner reads policies" on public.policies for select using (public.is_workspace_owner(workspace_id));
create policy "owner reads suppressions" on public.suppressions for select using (public.is_workspace_owner(workspace_id));
create policy "owner reads messages" on public.messages for select using (public.is_workspace_owner(workspace_id));
create policy "owner reads evals" on public.evals for select using (public.is_workspace_owner(workspace_id));
create policy "owner reads approvals" on public.approvals for select using (public.is_workspace_owner(workspace_id));
create policy "owner reads digest runs" on public.digest_runs for select using (public.is_workspace_owner(workspace_id));
-- integration_secrets: no policies on purpose (service role only).

-- Convenience view: each message with its latest eval and latest approval.
create or replace view public.message_ledger with (security_invoker = true) as
select
  m.*,
  e.id as eval_id, e.score, e.hallucination_score, e.policy_score, e.regulatory_score, e.pii_score,
  e.violations, e.has_block, e.judge_model, e.evaluated_at, e.target as eval_target,
  a.decision, a.decided_by, a.decided_at, a.note as decision_note
from public.messages m
left join lateral (
  select * from public.evals e where e.message_id = m.id order by e.evaluated_at desc limit 1
) e on true
left join lateral (
  select * from public.approvals a where a.message_id = m.id order by a.decided_at desc limit 1
) a on true;
