# SovereignOS specialist execution layer

## Implemented increment

The four existing provider APIs and their environment variable names are unchanged.
The main chat now offers a music handoff under a completed synthesized answer. Edit
the music direction and lyrics, enable the shared music connector once, and submit
a local generation. The completed private MP3 is playable and downloadable in chat.
Other specialist models are catalog entries explicitly marked planned, not executable.

The MCP server exposes `list_specialists`, `generate_music`,
`read_specialist_job`, and `toggle_specialist`. All four models share these tools.
The internal council tool round remains read-only: it can inspect availability and
job metadata; it does not independently launch duplicate generations. The web
handoff or an explicit MCP generation call starts a job. Artifact metadata is shared
with subsequent council runs, never represented as having listened to the audio.

## Architecture

Chat / MCP -> authenticated shared service -> Supabase durable queue -> local worker
-> local ACE-Step API -> private Supabase audio bucket -> authenticated chat playback.

The new SQL migration adds isolated settings, heartbeat and job tables plus a private
`specialist-assets` bucket. Existing owner-password authentication protects reads and
writes; this is a single-owner workspace, not a tenant-isolated multi-user service.
Tables have RLS enabled with access restricted to the server service role. Worker
credentials never appear in browser responses. Storage service credentials stay on
the web server; the local worker uploads audio through its leased job endpoint.

## Activation (not performed by the source change)

1. Apply `supabase/migrations/202610090002_specialists.sql` to the linked project,
   after reviewing pending migrations with `supabase migration list`. Do not blindly
   apply unrelated pending migrations. Deploy this code to the same Vercel project.
2. Install and run the official ACE-Step 1.5 API on a suitable local machine with
   `acestep-v15-turbo` loaded. No model weights or GPU services are bundled here.
3. On that worker set `ACESTEP_ORIGIN=http://127.0.0.1:8001`. If ACE-Step requires
   authentication, set `ACESTEP_API_KEY` in the worker's environment. These settings
   are never accepted through prompts. Only literal loopback origins are allowed.
4. Reuse the existing `WORKER_SECRET` pairing and `SOVEREIGN_ORIGIN`. The launcher
   can read the existing worker pairing from `.env.provision`; it does not copy
   Vercel provider keys. New ACE-Step variables must be exported in the process
   environment. No additional OpenAI, Claude, Perplexity or Grok setup is needed.
5. Run `npm run runner:specialists` locally. It checks the loaded model before
   announcing readiness. Enable music from the shared chat panel, then submit.

Cloud model execution remains disabled. Existing cloud storage and coordination
are used; generation runs on the local machine. Keep that machine awake while jobs run.

## Limits and failure behavior

- One track per job, 10–120 requested seconds; one generating job at a time.
- Three queued/running jobs maximum. Atomic rolling 24-hour budget of 600 requested
  seconds, including cancelled/failed jobs, to prevent retries bypassing the budget.
- Ten-minute worker execution limit, eight inference steps, fixed user-selected seed.
- No automatic generation retries. Reusing a request UUID recovers the same job;
  changing its input under the same UUID is rejected.
- Worker heartbeat every 15 seconds; claims expire after 90 seconds. Expired jobs
  become uncertain on the next ready-worker claim, never silently regenerated.
- Cancellation prevents successful completion and stops polling/download on the next
  worker heartbeat. ACE-Step can continue local computation: its documented API does
  not provide a task-cancellation endpoint. This is not a GPU kill switch.
- MP3 outputs are capped at 3 MB, checked by file signature, and downloaded only from
  the configured local ACE-Step origin without redirects. No arbitrary URL fetches.
- Upload uncertainty does not trigger another generation. A cancelled or interrupted
  upload can leave an unreferenced private object for later owner cleanup.
- Duration budget controls workload, not dollar expenditure. Dollar cost is unknown;
  no hosted-inference billing or automatic purchasing is enabled.

## Reproducibility and research boundaries

Each job stores its originating chat turn, requested prompt/lyrics/seed/tempo/duration,
adapter/model selection, input hash and audio SHA-256. These are requested settings,
not measured acoustic outcomes. Exact reproducibility also requires pinning the
ACE-Step environment, checkpoint revision and hardware; this is not yet captured.

EEG analysis, file import, device streaming, timestamp alignment, artifact rejection,
acoustic measurements, statistical testing, and adaptive experiments remain future
increments. No neurological or therapeutic effect is inferred from generated music.
Image, speech, video and literature adapters also remain future increments.

## Validation

Unit tests cover the API protocol with mocked responses, private artifact storage,
authentication, origin restrictions, cancelled leases, duplicate requests, missing
configuration, output signatures, and no automatic retries. Browser fixtures cover
the council-to-music handoff and audio link. These do not validate actual model quality,
GPU speed, a live database migration, or a real ACE-Step generation.

Official API reference: https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md
