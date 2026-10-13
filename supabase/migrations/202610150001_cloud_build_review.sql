begin;
-- Post-build review loop: cloud builds gain a durable, resumable 'reviewing'
-- phase between the sandbox run and the final answer. Apply through the
-- authenticated Supabase Management API (db query --linked), not db push;
-- this project has no supabase_migrations.schema_migrations table.
alter table public.astra_cloud_builds drop constraint if exists astra_cloud_builds_status_check;
alter table public.astra_cloud_builds add constraint astra_cloud_builds_status_check check(status in ('queued','running','reviewing','completed','failed','uncertain','cancelled'));
-- Claims one build that finished its sandbox phase and needs review + final
-- synthesis. Only claims rows still at 'independent review' so a dispatch that
-- died inside finalization (stage='finalizing') is left for an explicit retry
-- and never automatically re-billed.
create function public.astra_claim_cloud_build_review() returns setof public.astra_cloud_builds language plpgsql security invoker set search_path=public as $$
declare target uuid;
begin
 perform pg_advisory_xact_lock(hashtext('sovereign-cloud-build-review'));
 select id into target from astra_cloud_builds where status='reviewing' and stage='independent review' order by started_at for update skip locked limit 1;
 if target is null then return; end if;
 return query update astra_cloud_builds set stage='finalizing' where id=target returning *;
end $$;
revoke all on function public.astra_claim_cloud_build_review() from public,anon,authenticated;
grant execute on function public.astra_claim_cloud_build_review() to service_role;
commit;
