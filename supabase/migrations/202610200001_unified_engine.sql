-- One queue shared by dashboard and MCP. Only service-role server code may access it.
create table if not exists public.sovereign_engine_runs (
 id uuid primary key default gen_random_uuid(), owner text not null,
 client_id uuid not null, input jsonb not null, state jsonb not null,
 status text not null default 'queued' check(status in ('queued','running','complete','paused','cancelled')),
 claim uuid, claimed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner,client_id)
);
create index if not exists sovereign_engine_queue on public.sovereign_engine_runs(status,created_at);
alter table public.sovereign_engine_runs enable row level security;
revoke all on public.sovereign_engine_runs from anon,authenticated;
grant all on public.sovereign_engine_runs to service_role;

create table if not exists public.sovereign_engine_metrics (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references public.sovereign_engine_runs(id),
 model text not null, stage text not null, family text not null, reported_model text,
 success boolean not null, elapsed_ms integer, input_tokens bigint, output_tokens bigint,
 task_class text not null default 'general', created_at timestamptz not null default now()
);
alter table public.sovereign_engine_metrics enable row level security;
revoke all on public.sovereign_engine_metrics from anon,authenticated;
grant all on public.sovereign_engine_metrics to service_role;

create or replace function public.sovereign_claim_engine(p_id uuid default null)
returns setof public.sovereign_engine_runs language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
 perform pg_advisory_xact_lock(739215);
 -- Never replay a possibly charged call after a process crash.
 update sovereign_engine_runs set status='paused',updated_at=now()
 where status='running' and claimed_at<now()-interval '6 minutes';
 if (select count(*) from sovereign_engine_runs where status='running')>=2 then return; end if;
 select id into target from sovereign_engine_runs where status='queued' and (p_id is null or id=p_id)
 order by updated_at,created_at for update skip locked limit 1;
 if target is null then return; end if;
 return query update sovereign_engine_runs set status='running',claim=gen_random_uuid(),claimed_at=now(),updated_at=now() where id=target returning *;
end $$;
revoke all on function public.sovereign_claim_engine(uuid) from public,anon,authenticated;
grant execute on function public.sovereign_claim_engine(uuid) to service_role;

create table if not exists public.sovereign_engine_daily_budget (
 day date primary key, reserved_calls integer not null default 0
);
alter table public.sovereign_engine_daily_budget enable row level security;
revoke all on public.sovereign_engine_daily_budget from anon,authenticated;
grant all on public.sovereign_engine_daily_budget to service_role;
create or replace function public.sovereign_reserve_engine(p_id uuid,p_claim uuid,p_state jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(739216);
 if not exists(select 1 from sovereign_engine_runs where id=p_id and claim=p_claim and status='running' for update) then return false; end if;
 insert into sovereign_engine_daily_budget(day) values((now() at time zone 'UTC')::date) on conflict do nothing;
 update sovereign_engine_daily_budget set reserved_calls=reserved_calls+1 where day=(now() at time zone 'UTC')::date and reserved_calls<64;
 if not found then return false; end if;
 update sovereign_engine_runs set state=p_state,updated_at=now() where id=p_id and claim=p_claim and status='running';
 return true;
end $$;
revoke all on function public.sovereign_reserve_engine(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sovereign_reserve_engine(uuid,uuid,jsonb) to service_role;

create table if not exists public.sovereign_engine_actions (
 id uuid primary key default gen_random_uuid(), owner text not null, run_id uuid not null references public.sovereign_engine_runs(id),
 kind text not null check(kind in ('save_artifact','save_memory','handoff_to_aya')),
 payload jsonb not null, content_hash text not null, expires_at timestamptz not null,
 status text not null default 'prepared' check(status in ('prepared','executing','submitted','completed','uncertain','cancelled')),
 receipt jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.sovereign_engine_actions enable row level security;
revoke all on public.sovereign_engine_actions from anon,authenticated;
grant all on public.sovereign_engine_actions to service_role;

create unique index if not exists sovereign_engine_action_once on public.sovereign_engine_actions(owner,run_id,kind,content_hash);

create table if not exists public.sovereign_engine_memory (
 id uuid primary key default gen_random_uuid(), owner text not null, project_id text not null,
 source_run_id uuid not null references public.sovereign_engine_runs(id), action_id uuid unique not null references public.sovereign_engine_actions(id),
 content text not null, created_at timestamptz not null default now()
);
alter table public.sovereign_engine_memory enable row level security;
revoke all on public.sovereign_engine_memory from anon,authenticated;
grant all on public.sovereign_engine_memory to service_role;
