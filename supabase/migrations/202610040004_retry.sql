create or replace function public.astra_retry_run(p_run uuid)
returns boolean language plpgsql security invoker set search_path=public as $$
declare r public.astra_runs; first_retry integer;
begin
 select * into r from public.astra_runs where id=p_run for update;
 if not found or r.status not in ('failed','paused') or r.max_calls>=18 then return false; end if;
 select min(ordinal) into first_retry from public.astra_steps where run_id=p_run and status in ('failed','uncertain','pending');
 if first_retry is null then return false; end if;
 update public.astra_steps set status='pending',claim_token=null,claimed_at=null,output_path=null,error_code=null,finished_at=null
 where run_id=p_run and ordinal>=first_retry;
 update public.astra_runs set status='queued',max_calls=least(18,max_calls+6),max_reported_tokens=max_reported_tokens+60000 where id=p_run;
 return true;
end $$;
revoke all on function public.astra_retry_run(uuid) from public,anon,authenticated;
grant execute on function public.astra_retry_run(uuid) to service_role;
