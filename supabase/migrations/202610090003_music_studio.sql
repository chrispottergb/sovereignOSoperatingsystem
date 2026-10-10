create table public.astra_music_config (
 id text primary key check(id='main'), revision uuid not null,
 config jsonb not null, updated_at timestamptz not null default now()
);
create table public.astra_music_runs (
 id uuid primary key, status text not null check(status in ('evaluating','evaluated','challenging','challenged','validating','passed','rejected','failed')),
 brief jsonb not null, config jsonb not null, revision uuid not null,
 protocol_sha256 text not null, evaluation jsonb, challenge jsonb, validation jsonb,
 usage jsonb, error text, job_id uuid references public.astra_specialist_jobs(id),
 created_at timestamptz not null default now()
);
alter table public.astra_music_config enable row level security;
alter table public.astra_music_runs enable row level security;
revoke all on public.astra_music_config,public.astra_music_runs from anon,authenticated;
grant all on public.astra_music_config,public.astra_music_runs to service_role;
