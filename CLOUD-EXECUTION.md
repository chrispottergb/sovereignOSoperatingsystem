# Cloud execution rollout

## Live scope

The Railway `sovereign-cloud-dispatcher` cron runs every five minutes. It calls
the scoped `/api/cloud-worker` endpoint on Vercel. The endpoint reserves one
saved Orchestra/bot stage in Supabase, executes it, and saves its artifact.
It does not depend on the owner's browser or PC. Main-chat council runs remain
browser-driven; cloud coding and media generation are not enabled by this change.

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

## Cloud build work still required

Railway sandbox provisioning and command execution were verified with a temporary
VM: Node v24.21.0, Codex CLI 0.162.1, Claude Code 2.1.296. The VM was destroyed after
the probe. No local coding login or provider key was transferred.

Railway's authenticated CLI rejected `projectTokenCreate` with `Not Authorized`.
An owner-created project token for this environment, saved server-side in Vercel
Production as `RAILWAY_BUILD_TOKEN`, is required for unattended sandbox management.
Never place it in a prompt, browser storage, generated project, or sandbox.

After that prerequisite: implement a separate capped build queue; create isolated
sandboxes with private networking disabled; run the selected coding engine with
job-scoped model access; independently run checks; persist downloadable source and
reports; destroy sandboxes on completion/cancellation and recover interrupted
jobs. Do not mark `cloudBuildsReady` true merely because a token exists. Verify a
real build first. E2B is not required if the Railway sandbox route is used.

## Recovery

Pause the dispatcher from `/cloud` to stop new work. Preserve uncertain steps
and inspect saved artifacts before an explicit retry. Changing the Railway
function credential requires rotating the corresponding Vercel credential and
redeploying both. Do not enable unconditional retries on network errors.
