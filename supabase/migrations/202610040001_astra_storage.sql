-- Single-owner workspace. Only the authenticated application server may access these tables.
create table public.astra_projects (
 id uuid primary key default gen_random_uuid(), name text not null,
 brief text not null default '', audience text not null default '',
 voice text not null default '', objective text not null default '',
 created_at timestamptz not null default now()
);
create table public.astra_runs (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.astra_projects(id),
 prompt text not null, lane text not null, depth text not null,
 status text not null default 'queued' check(status in ('queued','running','paused','completed','failed','cancelled')),
 max_calls integer not null check(max_calls between 1 and 32),
 max_reported_tokens integer not null check(max_reported_tokens > 0),
 calls_started integer not null default 0, reported_tokens bigint not null default 0,
 connector_snapshot jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.astra_steps (
 run_id uuid not null references public.astra_runs(id), id text not null,
 ordinal integer not null, spec jsonb not null,
 status text not null default 'pending' check(status in ('pending','running','completed','failed','skipped','uncertain')),
 attempt integer not null default 0, claim_token uuid, claimed_at timestamptz,
 output_path text, usage jsonb, error_code text, finished_at timestamptz,
 primary key(run_id,id), unique(run_id,ordinal)
);
create table public.astra_connectors (
 id uuid primary key default gen_random_uuid(), provider text not null,
 label text not null, enabled boolean not null default false,
 models jsonb not null default '["openai","claude","perplexity","grok"]',
 permissions jsonb not null default '["read"]', config jsonb not null default '{}',
 encrypted_credentials text, created_at timestamptz not null default now()
);
create table public.astra_bots (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.astra_projects(id),
 name text not null, config jsonb not null,
 enabled boolean not null default false, next_run_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.astra_assets (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.astra_projects(id),
 run_id uuid references public.astra_runs(id), path text not null unique,
 title text not null, media_type text not null, sha256 text not null,
 created_at timestamptz not null default now()
);
create table public.astra_approvals (
 id uuid primary key default gen_random_uuid(), run_id uuid references public.astra_runs(id),
 connector_id uuid references public.astra_connectors(id),
 payload jsonb not null, payload_sha256 text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','executing','completed','uncertain')),
 approved_at timestamptz, expires_at timestamptz not null,
 result jsonb, created_at timestamptz not null default now()
);
create table public.astra_workspace_snapshots (
 id text primary key, revision bigint not null default 1, data jsonb not null,
 updated_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['astra_projects','astra_runs','astra_steps','astra_connectors','astra_bots','astra_assets','astra_approvals','astra_workspace_snapshots'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from anon, authenticated',t);
  execute format('grant all on table public.%I to service_role',t);
 end loop;
end $$;
insert into storage.buckets(id,name,public) values('astra-assets','astra-assets',false)
on conflict(id) do nothing;
-- No public Storage policies: server authorization is required for every object.
create index astra_runs_queue on public.astra_runs(created_at) where status in ('queued','running');
create index astra_bots_due on public.astra_bots(next_run_at) where enabled;
