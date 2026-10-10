-- Shared owner workspace, matching the existing password-authenticated app.
create table public.astra_specialist_settings (
 id text primary key check(id='music'), enabled boolean not null default false
);
insert into public.astra_specialist_settings(id) values('music');
create table public.astra_specialist_runner (
 id text primary key check(id='local'), last_seen timestamptz not null,
 ready boolean not null default false
);
create table public.astra_specialist_jobs (
 id uuid primary key default gen_random_uuid(), request_id uuid unique not null,
 input jsonb not null, status text not null default 'queued'
 check(status in ('queued','running','completed','failed','uncertain','cancelled')),
 stage text not null default 'queued', claim uuid, heartbeat_at timestamptz,
 created_at timestamptz not null default now(), artifact_path text,
 artifact_sha256 text, provenance jsonb, error text
);
alter table public.astra_specialist_settings enable row level security;
alter table public.astra_specialist_runner enable row level security;
alter table public.astra_specialist_jobs enable row level security;
revoke all on public.astra_specialist_settings,public.astra_specialist_runner,public.astra_specialist_jobs from anon,authenticated;
grant all on public.astra_specialist_settings,public.astra_specialist_runner,public.astra_specialist_jobs to service_role;

create function public.astra_queue_music(p_input jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare result uuid; seconds integer;
begin
 perform pg_advisory_xact_lock(hashtext('sovereign-specialist'));
 select id into result from astra_specialist_jobs where request_id=(p_input->>'requestId')::uuid;
 if result is not null then
  if exists(select 1 from astra_specialist_jobs where id=result and input<>p_input) then raise exception 'Request ID conflict'; end if;
  return result;
 end if;
 seconds := (p_input->>'seconds')::integer;
 if p_input->>'environment' is distinct from 'local' or seconds is null or seconds < 10 or seconds > 120 then raise exception 'Invalid local request'; end if;
 if not exists(select 1 from astra_specialist_settings where id='music' and enabled) then raise exception 'Music connector disabled'; end if;
 if not exists(select 1 from astra_specialist_runner where ready and last_seen>now()-interval '90 seconds') then raise exception 'Worker offline'; end if;
 if (select count(*) from astra_specialist_jobs where status in ('queued','running'))>=3 then raise exception 'Queue full'; end if;
 if (select coalesce(sum((input->>'seconds')::integer),0) from astra_specialist_jobs where created_at>now()-interval '24 hours')+seconds>600 then raise exception 'Daily duration budget reached'; end if;
 insert into astra_specialist_jobs(request_id,input) values((p_input->>'requestId')::uuid,p_input) returning id into result;
 return result;
end; $$;

create function public.astra_claim_specialist() returns setof public.astra_specialist_jobs
language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
 perform pg_advisory_xact_lock(hashtext('sovereign-specialist'));
 update astra_specialist_jobs set status='uncertain',stage='Worker lease expired',error='Check local ACE-Step tasks before creating another job; no automatic retry.' where status='running' and heartbeat_at<now()-interval '90 seconds';
 if exists(select 1 from astra_specialist_jobs where status='running') then return; end if;
 if not exists(select 1 from astra_specialist_settings where id='music' and enabled) then return; end if;
 select id into target from astra_specialist_jobs where status='queued' order by created_at for update skip locked limit 1;
 if target is null then return; end if;
 return query update astra_specialist_jobs set status='running',stage='Generating music',claim=gen_random_uuid(),heartbeat_at=now() where id=target returning *;
end; $$;
revoke all on function public.astra_queue_music(jsonb),public.astra_claim_specialist() from public,anon,authenticated;
grant execute on function public.astra_queue_music(jsonb),public.astra_claim_specialist() to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('specialist-assets','specialist-assets',false,3000000,array['audio/mpeg'])
on conflict(id) do nothing;
