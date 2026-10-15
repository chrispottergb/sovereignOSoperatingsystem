# Priority 2 — Resumable staged cloud builds (implementation spec)

**Status:** spec only. Build + validate this in a **deployed/live** environment
(real Railway sandbox, real Supabase). It rewrites the sandbox lifecycle and the
model-call lease; it must not be shipped unvalidated.

## Why it needs more than a loop
Two hard limits force the shape:
- **Vercel function cap: 300 s per invocation.** One sandbox coding stage
  (≤~4 min) + verify already approaches it; several stages in one invocation
  blow it. → **one stage per dispatcher tick.**
- **Model-call lease: `astra_charge_build_model` authorizes model calls only for
  5 minutes after `started_at`** (migration 202610140001). Any build running
  longer than that loses model access mid-run. → **the lease must refresh per
  stage.** This is why `cloudLimits().codingMinutes` is currently ceilinged at 4.

## State machine (extends the existing one)
`queued → running(stage 0) → [building ⇄ running(stage n)] → reviewing → completed|failed`

- **building**: durable, resumable, *no sandbox alive*. Project source is
  persisted; the next tick restores it into a fresh sandbox and runs the next
  stage. Interruptions leave the job here, reusing completed stages (never
  auto-billed — resume is a claim, like review).

## Migration `202610160001_cloud_build_stages.sql`
```sql
alter table public.astra_cloud_builds drop constraint if exists astra_cloud_builds_status_check;
alter table public.astra_cloud_builds add constraint astra_cloud_builds_status_check
  check(status in ('queued','running','building','reviewing','completed','failed','uncertain','cancelled'));
alter table public.astra_cloud_builds add column if not exists stage_index int not null default 0;
alter table public.astra_cloud_builds add column if not exists max_stages int not null default 1;
alter table public.astra_cloud_builds add column if not exists lease_until timestamptz;
alter table public.astra_cloud_builds add column if not exists model_call_cap int not null default 12;
-- Lease refresh: model calls allowed while now() < lease_until (fallback to the
-- old 5-min window when lease_until is null), capped per build, not hardcoded 12.
create or replace function public.astra_charge_build_model(p_job uuid,p_hash text) returns setof public.astra_cloud_builds language plpgsql security invoker set search_path=public as $$
begin
 return query update astra_cloud_builds set model_calls=model_calls+1
  where id=p_job and token_hash=p_hash and status='running'
    and (case when lease_until is null then started_at>now()-interval '5 minutes' else now()<lease_until end)
    and model_calls<model_call_cap returning *;
end $$;
-- Claim a building job to continue (mirrors astra_claim_cloud_build_review).
create function public.astra_claim_cloud_build_resume() returns setof public.astra_cloud_builds language plpgsql security invoker set search_path=public as $$
declare target uuid;
begin
 perform pg_advisory_xact_lock(hashtext('sovereign-cloud-build-resume'));
 if not exists(select 1 from astra_cloud_settings where id='main' and enabled) then return; end if;
 if exists(select 1 from astra_cloud_builds where status='running') then return; end if;
 select id into target from astra_cloud_builds where status='building' order by started_at for update skip locked limit 1;
 if target is null then return; end if;
 return query update astra_cloud_builds set status='running',stage='resuming stage',started_at=now() where id=target returning *;
end $$;
```
Grant/revoke to `service_role` as the other functions do. Apply via the
Management API (`db query --linked`), not `db push`.

## Code changes (`src/lib/server/cloud-builds.ts`)
1. `cloudLimits()` gains `maxStages: boundedEnv('CLOUD_BUILD_MAX_STAGES',1,1,8)`.
   Default 1 ⇒ **behaviour identical to today**; nothing changes until the owner
   opts in. `enqueue` writes `max_stages` and `model_call_cap` onto the row.
2. Factor the current sandbox body into `runCodingStage(job, stageIndex)`:
   - create sandbox; **if stageIndex>0, restore** the persisted source
     (`readArtifact(cloud-builds/<id>/source.json)` → write each file under
     `/app`) before coding;
   - set `lease_until = now()+codingMinutes+1min` on the row (so model calls are
     authorized for this stage), run the coding window, verify, and **persist the
     source snapshot** to `cloud-builds/<id>/source.json` (overwrite);
   - decide: engine reports complete, or `stageIndex+1 >= max_stages` → go to
     `reviewing` (as today); else checkpoint `status='building'`,
     `stage_index=stageIndex+1`, destroy sandbox, return (next tick resumes).
3. Tick order: stale-reap → **resume `building`** (`astra_claim_cloud_build_resume`)
   → review (`astra_claim_cloud_build_review`) → new `queued`. One unit of work
   per tick; each well under 300 s.
4. The bounded correction pass stays, applied on the **final** stage only.

## Continuation prompt (stage n>0)
"Continue the existing project in /app toward the request. Do NOT restart or
rewrite working files. Make incremental progress, keep tests passing, and report
what changed this stage." Include the prior stage's report + check summary.

## Tests to add (mock `railway`, `astra-store`, `model-completion`)
- maxStages=1 ⇒ single stage → `reviewing` (current behaviour unchanged).
- maxStages=3, engine "incomplete" ⇒ checkpoints `building` with
  `stage_index=1`, persists `source.json`, destroys sandbox.
- resume path restores `source.json` into the new sandbox before coding.
- final stage (stage_index+1==max_stages) → `reviewing` even if "incomplete".
- interrupted `building` job is claimable once and not double-billed.

## Guardrails (unchanged)
One running sandbox at a time; interrupted work → `uncertain`/left for explicit
recovery, never auto-rebilled; no publish/merge/deploy; Codex provider config
and token-redaction preserved. `recoverCloudBuild` already resumes a stranded
build — extend it to re-enter `building` when `stage_index>0`.

## Live verification before raising `CLOUD_BUILD_MAX_STAGES`
Run a 2-stage build end to end; confirm stage 1 persists source and checkpoints
`building`, stage 2 restores it and continues, the lease refresh lets stage 2's
model calls succeed past the 5-minute mark, and the final answer still lands.
Only then raise the env past 1.
