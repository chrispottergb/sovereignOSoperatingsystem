alter table public.astra_runs add column bot_id uuid references public.astra_bots(id);
alter table public.astra_runs add column request_key uuid unique;
alter table public.astra_runs add column context jsonb not null default '{}';
create unique index astra_bot_active on public.astra_runs(bot_id) where status in ('queued','running','paused');
create or replace function public.astra_launch_bot(p_bot uuid,p_request uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare b public.astra_bots; r uuid; st jsonb; n integer:=0;
begin
 select * into b from public.astra_bots where id=p_bot for update;
 if not found then raise exception 'Bot not found'; end if;
 select id into r from public.astra_runs where request_key=p_request;
 if found then return r; end if;
 select id into r from public.astra_runs where bot_id=p_bot and status in ('queued','running','paused');
 if found then return r; end if;
 insert into public.astra_runs(project_id,bot_id,request_key,prompt,lane,depth,max_calls,max_reported_tokens,context)
 values(b.project_id,b.id,p_request,b.config->>'purpose','bot','standard',(b.config->>'maxCalls')::int,(b.config->>'maxReportedTokens')::int,b.config) returning id into r;
 for st in select * from jsonb_array_elements(b.config->'steps') loop
  insert into public.astra_steps(run_id,id,ordinal,spec) values(r,st->>'id',n,st); n:=n+1;
 end loop;
 if n=0 then raise exception 'Missing workflow'; end if;
 return r;
end $$;
create or replace function public.astra_schedule_bots()
returns integer language plpgsql security invoker set search_path=public as $$
declare b public.astra_bots; n integer:=0;
begin
 for b in select * from public.astra_bots where enabled and next_run_at<=now() order by next_run_at limit 10 for update skip locked loop
  perform public.astra_launch_bot(b.id,gen_random_uuid());
  update public.astra_bots set next_run_at=now()+make_interval(hours=>greatest(6,(b.config->>'intervalHours')::int)) where id=b.id;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.astra_launch_bot(uuid,uuid),public.astra_schedule_bots() from public,anon,authenticated;
grant execute on function public.astra_launch_bot(uuid,uuid),public.astra_schedule_bots() to service_role;
-- Only one in-flight stage per run bounds spending and simplifies cancellation.
create unique index astra_one_running_step on public.astra_steps(run_id) where status='running';
-- Scheduler heartbeat is safe to expose without secrets, through the owner API.
create table public.astra_worker_health(id text primary key,last_seen timestamptz not null);
alter table public.astra_worker_health enable row level security;
revoke all on public.astra_worker_health from anon,authenticated;
grant all on public.astra_worker_health to service_role;
