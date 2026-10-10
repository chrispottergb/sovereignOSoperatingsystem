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

## Music Studio: three-model review

Open **Music Studio** from the main sidebar (`/music`). Genre, delivery, vocal tone,
singing style, rap style and desired-outcome pills accept custom options. Frequently
used choices sort first in that browser. Key, tempo, duration, seed and lyrics are
saved with the brief.

Apply `supabase/migrations/202610090003_music_studio.sql` after migration 002 to
persist settings and reviews. Save the actual authoritative QLL text and its version;
no substitute QLL protocol is bundled. Select three distinct configured providers:
Claude evaluator, Grok challenger and OpenAI validator are editable defaults, not
claims of comparative model quality. Existing server-side provider credentials are reused.

The explicit stages are evaluator -> challenger -> validator -> generation. Each
review stage makes one model request with bounded output and no automatic retry.
The challenger supplies a complete revised prompt. Only that revision can be sent
to generation after validation passes. Protocol and settings revisions invalidate
older approvals; each run preserves its brief, protocol snapshot, hash and usage.
A request UUID prevents duplicate evaluation charges on recovery. Interrupted
reviews may remain pending and are never automatically repeated. Starting a new
evaluation is an explicit action that may incur another charge.

The model library accepts Hugging Face model references for prompt preparation.
Adding a model does not install it or provide an execution adapter. ACE-Step remains
the only implemented music adapter, using the local worker described above. Cloud
hosting is still disabled. QLL review validates written instructions, not acoustic
properties or neurological effects of generated audio.

Tests use synthetic protocol text and mocked providers, database and generation
responses. Desktop and mobile browser tests exercise all three review stages and
model registration; they do not demonstrate a live QLL review or GPU generation.

## Post-generation QLL approval and the music library

Apply `supabase/migrations/202610090004_music_output_reviews.sql` after 003. Before
starting a new evaluation, save the authoritative QLL protocol, its version and a
complete output checklist (one unique requirement per line, up to 40). The owner
must ensure this checklist covers the intended QLL method; the app does not invent
the method or guarantee completeness. All requirements have equal weight and are
frozen with the original brief. Changes apply to new briefs, never retroactively.

The approved Music Library includes a track at **90% or higher**, including exactly
90%. Score = met requirements / all saved requirements * 100. Missing or unverified
requirements cannot count as met; duplicate or omitted IDs invalidate the report.
Structure and continuity must also be verified. This is rubric compliance, not a
probability of neurological efficacy or a scientific effectiveness score.

An independent audio-capable validation service is required. No such service is
provisioned by this change. Configure server-side `MUSIC_OUTPUT_VALIDATOR_URL`
(an HTTPS endpoint without query parameters) and `MUSIC_OUTPUT_VALIDATOR_KEY`.
The endpoint receives POST JSON contract `sovereign-music-output-v1`: actual private
MP3 bytes in base64, their SHA-256, original input, frozen QLL text/version, and the
numbered checklist. It must analyze the actual audio, with transcription and signal
analysis where needed. The full response contract is in `src/lib/music-output.ts`;
return every requirement with met/unmet/unverified and supporting evidence, plus
structural and continuity findings and the analyzer identity/version. The service
must treat reference text as data and return unverified for unsupported measurements.
Existing text-only council calls do not substitute for this service.

Configured validation starts after the completed audio upload response using Next's
`after` lifecycle; upload confirmation does not wait for audio analysis. If the
service is configured later, use **Validate actual audio against QLL** on a completed
review copy. A unique job reservation prevents duplicate paid reviews. Requests have
a 180-second timeout, bounded responses and no redirects or automatic retries.
An interrupted review may remain running; it never grants library admission.

Only approved reports matching the saved artifact hash are listed in the library.
Below-threshold, failed and unverifiable tracks remain accessible as review copies.
Playback and download of a review copy do not imply approval. Reports use the QLL
version saved for that generation, even if the current protocol changes afterward.
The common review service is reusable by future cloud generation adapters; this
change does not enable cloud music generation or deploy a validator. Live accuracy
and agreement with the intended QLL method require testing the chosen analyzer.

### Built-in OpenAI audio validator

When no custom validator URL/key is set, the app now reuses `OPENAI_API_KEY` with
`gpt-audio-1.5` on Chat Completions. It sends actual MP3 input and asks for text-only
findings, with `store: false`, a 6,000-token output cap, one request per track and no
automatic retries. No separate hosting or new provider credential is needed. The
model's identity is saved from the API response. Malformed or truncated responses
fail closed. This is a listening-based model evaluation, not calibrated DSP or EEG
measurement: exact acoustic and physiological claims must remain unverified unless
a custom measurement-capable validator is connected. Model access/billing must be
available on the existing OpenAI account.

Official API contract checked against:
https://developers.openai.com/api/docs/guides/audio-chat-completions
https://developers.openai.com/api/docs/models/gpt-audio-1.5

Deployment receipt: on 2026-10-09, migrations 202610090002, 202610090003 and
202610090004 were applied together in a transaction to the existing `ai sovereignos`
project through the authenticated Supabase CLI Management API. The database had no
`supabase_migrations.schema_migrations` history table; earlier app tables already
existed. Do not blindly push every historical migration to this project. The new
private `specialist-assets` bucket was verified with a 3 MB limit.

### Word protocol import

Music Studio accepts `.docx`, `.txt` and `.md` files up to 2 MB. Word text is
extracted locally in the browser with Mammoth 1.13.0 and placed in the editable
protocol field; import does not save or invoke a model. Review the text before
saving. Formatting and images are not part of the extracted protocol. Empty,
corrupt, encrypted, and over-20,000-character content is rejected without replacing
the existing text. Legacy `.doc` files require Word Save As `.docx` first.

The parser's optional CLI dependencies produce a moderate npm advisory via
argparse/sprintf-js; this app imports the standalone browser bundle and does not
execute Mammoth's CLI. No parser runs on the server or renders document HTML.
