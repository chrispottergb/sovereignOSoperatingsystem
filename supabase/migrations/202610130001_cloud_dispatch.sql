begin;
create table public.astra_cloud_settings (
 id text primary key check(id='main'), enabled boolean not null default false,
 enabled_at timestamptz, daily_steps integer not null default 24 check(daily_steps between 1 and 100)
);
insert into public.astra_cloud_settings(id) values('main');
create table public.astra_cloud_dispatches (
 id uuid primary key default gen_random_uuid(), slot bigint unique not null,
 run_id uuid not null references public.astra_runs(id),
 created_at timestamptz not null default now(), finished_at timestamptz,
 status text not null default 'running' check(status in ('running','finished','uncertain'))
);
alter table public.astra_cloud_settings enable row level security;
alter table public.astra_cloud_dispatches enable row level security;
revoke all on public.astra_cloud_settings,public.astra_cloud_dispatches from anon,authenticated;
grant all on public.astra_cloud_settings,public.astra_cloud_dispatches to service_role;
create or replace function public.astra_claim_cloud_dispatch()
returns table(dispatch_id uuid,run_id uuid) language plpgsql security invoker set search_path=public as $$
declare cfg public.astra_cloud_settings; target uuid; dispatch uuid; tick bigint;
begin
 perform pg_advisory_xact_lock(hashtext('sovereign-cloud-dispatch'));
 select * into cfg from astra_cloud_settings where id='main';
 if not cfg.enabled or cfg.enabled_at is null then return; end if;
 tick:=floor(extract(epoch from now())/300);
 if exists(select 1 from astra_cloud_dispatches d where d.slot=tick) then return; end if;
 if exists(select 1 from astra_cloud_dispatches d where d.status='running' and d.created_at>now()-interval '4 minutes') then return; end if;
 update astra_cloud_dispatches set status='uncertain',finished_at=now() where status='running' and created_at<=now()-interval '4 minutes';
 if (select count(*) from astra_cloud_dispatches d where d.created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=cfg.daily_steps then return; end if;
 perform public.astra_schedule_bots();
 select r.id into target from astra_runs r where r.status in ('queued','running') and r.created_at>=cfg.enabled_at
 order by r.created_at for update skip locked limit 1;
 if target is null then return; end if;
 insert into astra_cloud_dispatches(slot,run_id) values(tick,target) returning id into dispatch;
 return query select dispatch,target;
end $$;
revoke all on function public.astra_claim_cloud_dispatch() from public,anon,authenticated;
grant execute on function public.astra_claim_cloud_dispatch() to service_role;
commit;
