alter table public.astra_runs add column if not exists orchestration_version text;
create table public.astra_build_jobs(
 id uuid primary key default gen_random_uuid(),run_id uuid not null references public.astra_runs(id),step_id text not null,
 claim_token uuid not null,status text not null default 'dispatched' check(status in ('dispatched','running','completed','failed','cancelled')),
 engine text not null check(engine in ('codex','claude-code')),created_at timestamptz not null default now(),heartbeat_at timestamptz,output_path text,
 unique(run_id,step_id,claim_token)
);
alter table public.astra_build_jobs enable row level security;
revoke all on public.astra_build_jobs from anon,authenticated;
grant all on public.astra_build_jobs to service_role;
create or replace function public.astra_launch_orchestra(p_request uuid,p_prompt text,p_context jsonb,p_steps jsonb,p_intent text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare r uuid;p uuid;st jsonb;n int:=0;
begin
 perform pg_advisory_xact_lock(hashtext(p_request::text));
 select id into r from public.astra_runs where request_key=p_request;if found then return r;end if;
 insert into public.astra_projects(name,brief) values('Orchestra project',left(p_prompt,12000)) returning id into p;
 insert into public.astra_runs(project_id,request_key,prompt,lane,depth,max_calls,max_reported_tokens,context,orchestration_version)
 values(p,p_request,p_prompt,p_intent,'standard',jsonb_array_length(p_steps),(p_context->>'maxReportedTokens')::int,p_context,'1') returning id into r;
 for st in select * from jsonb_array_elements(p_steps) loop
 insert into public.astra_steps(run_id,id,ordinal,spec)values(r,st->>'id',n,st);n:=n+1;
 end loop;
 return r;
end $$;
revoke all on function public.astra_launch_orchestra(uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.astra_launch_orchestra(uuid,text,jsonb,jsonb,text) to service_role;
