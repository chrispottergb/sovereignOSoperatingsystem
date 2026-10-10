create table public.astra_music_output_reviews (
 job_id uuid primary key references public.astra_specialist_jobs(id),
 run_id uuid not null references public.astra_music_runs(id),
 status text not null check(status in ('running','approved','below_threshold','unverifiable','failed')),
 score double precision check(score>=0 and score<=100),
 artifact_sha256 text not null, protocol_sha256 text not null, rubric_sha256 text not null,
 report jsonb, error text, created_at timestamptz not null default now(),
 check(status <> 'approved' or (score is not null and score>=90 and report is not null))
);
alter table public.astra_music_output_reviews enable row level security;
revoke all on public.astra_music_output_reviews from anon,authenticated;
grant all on public.astra_music_output_reviews to service_role;
