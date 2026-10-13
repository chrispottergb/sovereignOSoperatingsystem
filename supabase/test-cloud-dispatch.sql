begin;
-- All fixtures and settings roll back. No model API calls are made.
do $$
declare project uuid; job uuid; count_claims integer; claimed uuid;
begin
 insert into astra_projects(name) values('Cloud dispatch transaction test') returning id into project;
 insert into astra_runs(project_id,prompt,lane,depth,max_calls,max_reported_tokens)
 values(project,'Synthetic dispatch test','test','focused',1,1000) returning id into job;
 update astra_bots set enabled=false where enabled;
 update astra_cloud_settings set enabled=false,enabled_at=now(),daily_steps=1;
 select count(*) into count_claims from astra_claim_cloud_dispatch();
 if count_claims<>0 then raise exception 'Disabled worker claimed work'; end if;
 update astra_cloud_settings set enabled=true;
 select run_id into claimed from astra_claim_cloud_dispatch();
 if claimed is distinct from job then raise exception 'Expected the new synthetic job, got %',claimed; end if;
 select count(*) into count_claims from astra_claim_cloud_dispatch();
 if count_claims<>0 then raise exception 'Duplicate tick claimed work'; end if;
 update astra_cloud_dispatches set slot=slot-1,status='finished',finished_at=now() where run_id=job;
 select count(*) into count_claims from astra_claim_cloud_dispatch();
 if count_claims<>0 then raise exception 'Daily budget exceeded'; end if;
 update astra_cloud_settings set daily_steps=24,enabled_at=now()+interval '1 second';
 select count(*) into count_claims from astra_claim_cloud_dispatch();
 if count_claims<>0 then raise exception 'Old jobs were dispatched'; end if;
end $$;
rollback;
