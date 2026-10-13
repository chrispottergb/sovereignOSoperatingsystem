begin;
create table public.astra_cloud_builds (
 id uuid primary key default gen_random_uuid(), request_id uuid unique not null,
 input jsonb not null, status text not null default 'queued' check(status in ('queued','running','completed','failed','uncertain','cancelled')),
 stage text not null default 'queued', created_at timestamptz not null default now(), started_at timestamptz,
 sandbox_id text, token_hash text, model_calls integer not null default 0,
 result jsonb, artifact_path text
);
alter table public.astra_cloud_builds enable row level security;
revoke all on public.astra_cloud_builds from anon,authenticated;
grant all on public.astra_cloud_builds to service_role;
create function public.astra_enqueue_cloud_build(p_request uuid,p_input jsonb) returns uuid language plpgsql security invoker set search_path=public as $$
declare job astra_cloud_builds;
begin
 perform pg_advisory_xact_lock(hashtext('sovereign-cloud-build'));
 select * into job from astra_cloud_builds where request_id=p_request;
 if found then
  if job.input<>p_input then raise exception 'REQUEST_MISMATCH'; end if;
  return job.id;
 end if;
 if (select count(*) from astra_cloud_builds where created_at>=(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'))>=2 then raise exception 'DAILY_BUILD_LIMIT'; end if;
 insert into astra_cloud_builds(request_id,input) values(p_request,p_input) returning * into job;
 return job.id;
end $$;
create function public.astra_claim_cloud_build() returns setof public.astra_cloud_builds language plpgsql security invoker set search_path=public as $$
declare target uuid;
begin
 perform pg_advisory_xact_lock(hashtext('sovereign-cloud-build'));
 if not exists(select 1 from astra_cloud_settings where id='main' and enabled) then return; end if;
 if exists(select 1 from astra_cloud_builds where status='running') then return; end if;
 if (select count(*) from astra_cloud_builds where started_at>=(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'))>=2 then return; end if;
 select id into target from astra_cloud_builds where status='queued' order by created_at for update skip locked limit 1;
 if target is null then return; end if;
 return query update astra_cloud_builds set status='running',stage='creating isolated sandbox',started_at=now() where id=target returning *;
end $$;
create function public.astra_charge_build_model(p_job uuid,p_hash text) returns setof public.astra_cloud_builds language plpgsql security invoker set search_path=public as $$
begin
 return query update astra_cloud_builds set model_calls=model_calls+1 where id=p_job and token_hash=p_hash and status='running' and started_at>now()-interval '5 minutes' and model_calls<12 returning *;
end $$;
revoke all on function public.astra_enqueue_cloud_build(uuid,jsonb),public.astra_claim_cloud_build(),public.astra_charge_build_model(uuid,text) from public,anon,authenticated;
grant execute on function public.astra_enqueue_cloud_build(uuid,jsonb),public.astra_claim_cloud_build(),public.astra_charge_build_model(uuid,text) to service_role;
commit;
