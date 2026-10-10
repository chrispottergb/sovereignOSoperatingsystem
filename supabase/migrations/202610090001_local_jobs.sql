create table if not exists public.astra_local_jobs (
 id uuid primary key default gen_random_uuid(), request_id uuid unique not null,
 input jsonb not null, status text not null default 'queued' check(status in ('queued','running','completed','failed','uncertain','cancelled')),
 claim uuid, stage text, created_at timestamptz not null default now(), heartbeat_at timestamptz, result jsonb
);
alter table public.astra_local_jobs enable row level security;
revoke all on public.astra_local_jobs from anon,authenticated;
grant all on public.astra_local_jobs to service_role;
create table if not exists public.astra_local_runner (id text primary key, last_seen timestamptz not null, engines jsonb not null);
alter table public.astra_local_runner enable row level security;
revoke all on public.astra_local_runner from anon,authenticated;
grant all on public.astra_local_runner to service_role;
create or replace function public.astra_claim_local_job() returns setof public.astra_local_jobs language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
 perform pg_advisory_xact_lock(hashtext('sovereign-local-builder'));
 update astra_local_jobs set status='uncertain',result='{"error":"Runner heartbeat lost. Check local files before creating another build."}'::jsonb where status='running' and heartbeat_at < now()-interval '3 minutes';
 if exists(select 1 from astra_local_jobs where status='running') then return; end if;
 select id into target from astra_local_jobs where status='queued' order by created_at for update skip locked limit 1;
 if target is null then return; end if;
 return query update astra_local_jobs set status='running',claim=gen_random_uuid(),heartbeat_at=now(),stage='starting' where id=target returning *;
end; $$;
revoke all on function public.astra_claim_local_job() from public,anon,authenticated;
grant execute on function public.astra_claim_local_job() to service_role;
