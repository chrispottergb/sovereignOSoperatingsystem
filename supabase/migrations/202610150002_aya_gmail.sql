begin;
create table if not exists public.astra_aya_gmail(id text primary key check(id='main'),email text not null check(email='drpotterbeatz@gmail.com'),encrypted_refresh_token text not null,connected_at timestamptz not null default now());
alter table public.astra_aya_gmail enable row level security;
revoke all on public.astra_aya_gmail from anon,authenticated;
grant all on public.astra_aya_gmail to service_role;
commit;
