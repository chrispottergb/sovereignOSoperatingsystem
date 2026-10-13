# Cloud execution rollout

## Live scope

The Railway `sovereign-cloud-dispatcher` cron runs every five minutes. It calls
the scoped `/api/cloud-worker` endpoint on Vercel. The endpoint reserves one
saved Orchestra/bot stage in Supabase, executes it, and saves its artifact.
It does not depend on the owner's browser or PC. Main-chat council runs remain
browser-driven. A separate cloud code-build queue is now implemented; media generation workers are separate.

Owner controls: `/cloud`. Pause stops new reservations; an in-flight model call
may complete. Stage cancellation and retry remain in Orchestra/Grokbot Studio.

## Limits and authentication

- One cloud dispatch at a time, one reservation per five-minute UTC slot.
- 24 stage reservations per UTC day. This is not a dollar cap; provider retries,
  searches, and API usage are billed by providers. Existing per-run call and token
  budgets still apply.
- Only runs created on or after the first activation time are automatically
  picked up. Older saved queues are not silently restarted.
- Interrupted dispatches become uncertain, not automatically retried. The
  existing step claim/lease prevents a previously running stage being rebilled.
- Railway: one replica, 0.1 vCPU, 125 MB memory, no automatic crash restarts.
  Monthly hosting hard limits are workspace-wide and were not changed because
  another application shares the workspace.
- `CLOUD_WORKER_SECRET` is a new scoped credential. Railway receives neither
  provider keys nor the Supabase service key. It can probe/tick, not change owner
  settings or submit arbitrary model prompts.
- Provider and database credentials stay on Vercel. No public worker domain.

When `CLOUD_WORKER_SECRET` is present, the legacy `workerTick` path stops launching
stages; this ensures foreground kicks cannot bypass the cloud reservation budget.
The scheduler continues to honor owner-enabled bot schedules. There were zero
enabled recurring bots at activation.

## Deployment evidence (2026-10-13)

- Vercel deployment: `dpl_HoMcSdtSP5Hv5tZHzHrfWDUEwnpi`, production alias
  `https://sovereign-ai-workspace-zeta.vercel.app`.
- Railway project: `cb01c168-2aa7-42a4-b319-0a1adffa4734`.
- Environment: `fb94bbe9-dd34-40d4-9e83-41331b2dd41f`.
- Dispatcher service: `4a62a3c8-4d09-4526-8c2f-d2b64ad68f60`.
- Scheduled end-to-end verification run:
  `a1b759eb-5474-43e2-bd85-a031e6d293e6`, completed, one model call,
  186 reported tokens. Its output is saved in private Supabase storage.
- 208 unit tests, desktop/mobile cloud-control tests, lint, typecheck, and
  production build passed. `supabase/test-cloud-dispatch.sql` passed against
  production inside a rollback-only transaction.
- Migration `202610130001_cloud_dispatch.sql` was applied through authenticated
  Supabase Management API (`db query --linked`). This project has no
  `supabase_migrations.schema_migrations` table; do not blindly replay existing
  migration files with `db push`.

## Isolated cloud builds

Production RAILWAY_BUILD_TOKEN was verified against the intended environment without exposing its value. Codex or Claude Code can be selected in Orchestra or the build action attached to a council answer.

- Separate queue: two submissions per UTC day, one running sandbox, at most two minutes of coding and 12 model requests per build. Claude Code honors a budget up to $1. These are initial conservative limits, not a provider-wide dollar cap.
- Each sandbox uses 1 CPU / 2 GB, public-only isolated networking, and a ten-minute idle expiry. It receives only a short-lived job token, never provider, database, or Railway management credentials.
- The Vercel proxy restricts model access to the selected engine/model, revokes access on cancellation/completion, and enforces an atomic call limit. Provider output is capped at 4096 tokens per request.
- The worker runs available npm test/build scripts independently of the agent report, saves source and checks in private Supabase storage, then destroys the VM. Missing scripts are reported as not run. Source export is bounded to 60 text files / 1 MB; omissions are recorded.
- New projects and council briefs are supported. Repository imports, local file imports, automatic publishing, merging and deployment are not enabled. Cloud builds do not yet have the local runner's post-build multi-model review.
- Pausing stops new jobs. Cancellation revokes model access immediately; an already running command can continue until its time limit. Interrupted work is uncertain and is not automatically retried.
- Migration 202610140001_cloud_builds.sql and rollback-only queue/call-limit tests were applied through the authenticated Supabase Management API. No migration-history table exists here.

Validation: 220 unit tests and desktop/mobile cloud selection and pause controls passed. Production deployment dpl_5LXPWkLdWqpRCE3r4aKGzZHWZRi9 is READY and aliased to the live site.

Live verification (2026-10-13):
- Codex job bc14499b-ac6f-479f-bcc4-933dca62d5d5: completed, three model requests, three source files, three independently executed tests passed. Artifact retrieval HTTP 200. Initial zero-call routing failure was explicitly retried after configuring the custom provider; its old diagnostic artifact is retained.
- Claude Code job d1712416-352a-4129-9cfe-34d9a3b29bfa: completed, three model requests, three source files, three independently executed tests passed.
- Neither fixture required a build script, reported as not_run. Railway sandbox list was empty after both jobs.
- These two setup jobs consume today's two-submission allowance; it resets at 00:00 UTC.
- Vercel uses a newer npm version than the local runtime. The lockfile was repaired with npm 12.2.0 to include missing optional @emnapi entries; production clean installation and build passed.
- Codex custom provider configuration follows https://developers.openai.com/codex/config-reference; explicit HTTP Responses routing avoids using the built-in provider's default WebSocket endpoint.

## Recovery

Pause the dispatcher from `/cloud` to stop new work. Preserve uncertain steps
and inspect saved artifacts before an explicit retry. Changing the Railway
function credential requires rotating the corresponding Vercel credential and
redeploying both. Do not enable unconditional retries on network errors.
