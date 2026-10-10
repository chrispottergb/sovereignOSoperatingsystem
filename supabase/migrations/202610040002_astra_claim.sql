-- Claims serialize on each run to enforce its call budget across concurrent workers.
create or replace function public.astra_claim_step(p_run_id uuid)
returns setof public.astra_steps language plpgsql security invoker set search_path = public as $$
declare r public.astra_runs; s public.astra_steps; token uuid;
begin
 select * into r from public.astra_runs where id=p_run_id for update;
 if not found or r.status not in ('queued','running') then return; end if;
 -- A lease timeout is uncertain, not evidence the provider did not charge.
 update public.astra_steps set status='uncertain', error_code='WORKER_INTERRUPTED'
 where run_id=p_run_id and status='running' and claimed_at < now()-interval '10 minutes';
 if exists(select 1 from public.astra_steps where run_id=p_run_id and status='uncertain') then
  update public.astra_runs set status='paused' where id=p_run_id;
  return;
 end if;
 if r.calls_started >= r.max_calls or r.reported_tokens >= r.max_reported_tokens then
  update public.astra_runs set status='paused' where id=p_run_id;
  return;
 end if;
 select * into s from public.astra_steps st
 where st.run_id=p_run_id and st.status='pending'
 and not exists (
  select 1 from jsonb_array_elements_text(st.spec->'depends') dep(id)
  left join public.astra_steps parent on parent.run_id=st.run_id and parent.id=dep.id
  where parent.id is null or parent.status not in ('completed','failed','skipped')
 ) order by ordinal limit 1 for update;
 if not found then return; end if;
 token := gen_random_uuid();
 update public.astra_runs set status='running', calls_started=calls_started+1 where id=p_run_id;
 return query update public.astra_steps set status='running', attempt=attempt+1,
 claim_token=token, claimed_at=now() where run_id=p_run_id and id=s.id returning *;
end $$;
revoke all on function public.astra_claim_step(uuid) from public,anon,authenticated;
grant execute on function public.astra_claim_step(uuid) to service_role;

create or replace function public.astra_finish_step(p_run_id uuid,p_step_id text,p_claim uuid,p_status text,p_path text,p_usage jsonb,p_error text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare changed integer; tokens bigint;
begin
 if p_status not in ('completed','failed','skipped') then raise exception 'Invalid step status'; end if;
 perform 1 from public.astra_runs where id=p_run_id for update;
 update public.astra_steps set status=p_status,output_path=p_path,usage=p_usage,error_code=p_error,finished_at=now()
 where run_id=p_run_id and id=p_step_id and claim_token=p_claim and status='running';
 get diagnostics changed = row_count;
 if changed=0 then return false; end if;
 tokens := greatest(0,coalesce((p_usage->>'inputTokens')::bigint,0))+greatest(0,coalesce((p_usage->>'outputTokens')::bigint,0));
 update public.astra_runs set reported_tokens=reported_tokens+tokens where id=p_run_id;
 if not exists(select 1 from public.astra_steps where run_id=p_run_id and status in ('pending','running','uncertain')) then
  update public.astra_runs set status=case when exists(select 1 from public.astra_steps where run_id=p_run_id and status='completed') then 'completed' else 'failed' end where id=p_run_id and status in ('queued','running');
 end if;
 return true;
end $$;
revoke all on function public.astra_finish_step(uuid,text,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.astra_finish_step(uuid,text,uuid,text,text,jsonb,text) to service_role;
