# Handoff — Cloud-build review loop (priority 1)

**Date:** 2026-10-15
**Repo:** chrispottergb/sovereignOSoperatingsystem
**Branch:** `claude-handoff-cloud-builds`
**Where this was done:** a claude.ai *cloud* session. It can edit code and run
unit tests, lint, typecheck and `next build`. It **cannot** deploy or run the
live pipeline — no `RAILWAY_BUILD_TOKEN`, no Supabase service key, no provider
keys, no local runner. Deploy must happen from a session/machine that has them
(your local Claude Code against `sovereign-ai-workspace`, or Vercel/Railway
with their configured env).

---

## 1. Git state right now (verified)

```
c713b68  Close the cloud-build review loop with a durable reviewing phase   <- my work
f635562  Run selectable cloud coding jobs in isolated Railway sandboxes      <- your pre-work tip
```
- `refs/heads/claude-handoff-cloud-builds` = `c713b68` (pushed) ✅
- `refs/heads/main` = `c713b68` (I created it; it currently also points at the work)
- Working tree clean.

**PR status:** no PR exists. `main` was accidentally created at the work tip, so
a PR `main <- claude-handoff-cloud-builds` would be empty. To get a clean,
reviewable single-commit PR, `main` must be rewound to `f635562`. The cloud
session's force-push was blocked by the safety classifier. **You (or the local
session) run ONE command:**
```
git push origin f63556252581054a436a1fa6104097bbb070de4d:refs/heads/main --force
```
Then open PR `main <- claude-handoff-cloud-builds` (it will show exactly
`c713b68`). This is cosmetic/process only — it does NOT affect deploy.

---

## 2. What shipped this session (commit c713b68)

Closed the priority-1 loop: **council brief → coding engine → saved source +
independent test evidence → review by another provider → bounded correction →
one final answer in the original chat**, with durable checkpoints. Five files:

- **`src/lib/server/cloud-builds.ts`** — the real change. `runCloudBuildTick`
  now, after the sandbox codes + independently verifies:
  - runs **one bounded correction pass** iff a verification check objectively
    `failed` (its own window, `CLOUD_BUILD_CORRECTION_MINUTES`, default 1 / max 2
    / 0 disables), reusing the live checkout, then re-verifies;
  - stores source+checks, then **checkpoints to a new `reviewing` status** and
    destroys the VM;
  - new exported `finalizeCloudBuild` (no sandbox, resumable): the **opposite
    provider** (codex→claude, claude→openai) reviews the *saved* artifacts, the
    review is checkpointed, then the build's `synthesizer` (else Claude) writes
    **`result.final`** — the single answer shown in chat by `council-build.tsx`.
    Terminal status = `completed` only if recorded checks pass, else `failed`
    with the failure stated in the final answer.
- **`supabase/migrations/202610150001_cloud_build_review.sql`** — NEW. Adds the
  `reviewing` status to the CHECK constraint and the advisory-locked
  `astra_claim_cloud_build_review()` RPC.
- **`src/components/council-build.tsx`** — honest UI copy (correction window +
  cross-provider review/final).
- **`CLOUD-EXECUTION.md`** — documents the loop; removed the stale "no post-build
  review" limitation.
- **`tests/cloud-builds.test.ts`** — updated + 4 new tests.

### Design invariants (do not regress)
- Review/final run server-side on Vercel (which holds provider keys); they are
  **separate** from the sandbox's 12-call job budget and do NOT go through the
  job-scoped proxy.
- Sandbox runs **once**; checkpointed before teardown so review/final never
  re-enter a sandbox or re-bill coding.
- A provider failure in the review phase → `uncertain` with the review
  preserved; a dispatch that dies mid-finalization (`stage='finalizing'`) is
  **not** auto-reclaimed (honors "interrupted work must not be auto-rerun and
  billed").
- Correction is a **separate** coding window on top of the initial 2 min. Keep
  it short: the sandbox's job token still lapses 5 min after the build started
  (`astra_charge_build_model` enforces `started_at > now() - 5 min`).

### Validation (all in the cloud session, exit 0)
- `vitest run` → **224 passed** (was 220). Lint clean. `tsc --noEmit` clean.
  `next build` succeeded. No `AGENTS.md` churn.
- **Not run (cannot, here):** live Railway sandbox, real Supabase, real provider
  calls, e2e against production. Mock-tested only.

---

## 3. DEPLOY — the ordering that makes it "not fail"

The code emits and claims the `reviewing` status. If you deploy the code
**before** applying the migration, the DB CHECK constraint rejects
`status='reviewing'` and **every cloud build strands at the sandbox→review
boundary**. So:

1. **Apply the migration FIRST**, via the authenticated Supabase Management API
   (`db query --linked`) — the same path your prior migrations used. **Do NOT
   `db push`** (no `supabase_migrations.schema_migrations` table in this
   project). File: `supabase/migrations/202610150001_cloud_build_review.sql`.
   Verify after: `status='reviewing'` is accepted and
   `astra_claim_cloud_build_review` exists and is granted to `service_role`.
2. **Then deploy** the Vercel app (project `sovereign-ai-workspace`). Preserve
   the repaired `package-lock.json` (npm optional `@emnapi` entries); use the
   clean-install path that already works on Vercel.
3. Optional env: `CLOUD_BUILD_CORRECTION_MINUTES` (default 1; 0 disables
   correction). This raises max coding time per build above the old 2 min —
   intended, documented.

### Live verification after deploy (do this, don't assume)
- Submit one small cloud build from `/orchestra` or a council answer.
- Expect the job to walk `queued → running → reviewing → completed` across
  dispatcher ticks (≈5–10 min total; review/final land on the next tick after
  the sandbox phase — latency is intentional, favouring durability and the 300 s
  function cap).
- Confirm `result.final` renders in the chat; confirm the downloadable artifact
  still has source + checks; confirm the sandbox was destroyed (empty Railway
  sandbox list).
- Confirm a deliberately failing build ends `failed` with the failure visible in
  the final answer (not dressed up as success).

### Rollback
- Code: revert `c713b68`. The `reviewing` status/RPC can remain (harmless) or be
  dropped after no rows are in `reviewing`.

---

## 4. "Symbiotic" — where the orchestration actually stands

The council design in `src/lib/orchestra/plan.ts` is already symbiotic by
construction: Evidence (Perplexity) → Proposal → Challenge (Grok) → Resolution
(Astra/OpenAI) → **Review by a different provider** → final (Claude). Models
share context and challenge each other; the Conductor "does not treat a model's
claim as proof that a tool ran." This session extended that same symbiosis to
the **cloud build path**, which previously stopped at verification: a build by
one engine is now independently reviewed by the *other* provider and synthesized
into one answer.

What "symbiotic" still needs (priorities 2–5, NOT done):
2. **Larger builds** — replace the single short window with resumable, bounded
   stages + persisted project files; budget/progress/cancel/recovery controls;
   limits configurable without silently raising spend.
3. **Repository/project selection** — safe repo import + continue existing
   projects; credentials stay out of generated code/artifacts; changes saved as
   reviewable diffs/branches before any merge/deploy.
4. **Durable main-chat orchestration** — closing the browser must not lose a run;
   reopening recovers progress and the combined result. (The `reviewing`-phase
   pattern added here is the template for this.)
5. **Specialist audit** — verify what Muse, Grokbot, music providers, shared
   connectors actually support; route through a common capability registry +
   tool interface; mark unavailable capabilities honestly.

---

## 5. Hard guardrails to keep (from your handoff)

- Never print/commit/log secrets; never copy real provider keys into sandboxes.
- Codex custom provider config stays: `wire_api="responses"`,
  `supports_websockets=false`, retries 0. Preserve it.
- Don't blindly replay migrations with `db push`.
- No unconditional retries; interrupted work is `uncertain`, not auto-rebilled.
- No automatic publish/merge/deploy of generated user projects without explicit
  authorization.
- The Expo repo (`chrispottergb/SovereignOS`) and the `soverign`/`games` repos
  are unrelated — this work is only in `sovereignOSoperatingsystem`.

---

## 6. Open decisions for you
- Approve the `main` rewind so the PR is clean? (process only.)
- Keep review+final combined in one `reviewing` tick (current, ≤240 s) or split
  into two ticks for extra safety margin under the 300 s cap?
- Correction default of 1 min OK, or tune `CLOUD_BUILD_CORRECTION_MINUTES`?
- Proceed to priority 2 next?
