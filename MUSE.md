# Meta Muse integration

Muse Spark 1.3 Standard uses the server-only `MUSE_API_KEY` already configured in Vercel Production. No Contributor fallback is performed.

In the main chat, enable **Include Muse adviser (+1 call)** before sending a council prompt. One completed, bounded Muse contribution is saved on the turn and shared with every research, review, correction and final synthesis call. Retry reuses a saved Muse contribution. A failed or incomplete Muse call pauses the workflow instead of inventing evidence. The settings dialog includes a small paid **Test Muse connection** probe. Muse usage is shown separately under the saved adviser details.

The local MCP server exposes `sovereign_muse_advice` through its authenticated gateway and `synthesize_request` accepts `use_muse: true`. Restart an already-running MCP process to discover the added tool. The four original council providers remain unchanged.

This integration provides text advice with supplied context. It does not provide Meta image generation, audio transcription, browser control, arbitrary execution, or cloud builds. Those require separate tool adapters. Requests use low reasoning effort, a 2,200-token completion ceiling, a 90-second timeout, no automatic retries, and a fixed Meta endpoint. The probe uses 256 tokens and minimal reasoning. Do not equate key presence with successful model access.

Validation: unit suite, desktop/mobile full council test with Muse evidence asserted at every stage, TypeScript, scoped lint, Vercel production build, then live Meta smoke test.

Production deployment: dpl_9KPW4T14BkVfV3Csh2QPTUYb3jpD (2026-10-10). Live probe reached Meta but returned HTTP 402. No successful generation verified; owner must resolve Meta billing/Standard access before use. No automatic Contributor fallback or credit purchase.

## Muse workspace

`/muse` adds Standard model and reasoning dropdowns, a connection probe, independent tasks and an opt-in three-call plan/draft/review workflow. Options and the last 30 page calls are browser-local. Routing can be manual, all council prompts, or a documented keyword matcher for design/review/code/planning tasks. Each turn snapshots model options and reuses its completed Muse contribution on retry. All council stages receive that contribution. MCP `sovereign_muse_advice` also accepts model and reasoning.

Metrics report provider token counts, client/server elapsed duration and success/failure. They are not cost or quality estimates. Failed requests can still incur unreported usage. This release does not grant shell, browsing, publishing, scheduled execution or cloud worker access. The original cloud execution restriction remains in effect.

Live verification: Production deployment dpl_98jYqFbvR9Jq7pnHzQCn5ndRg1PJ returned HTTP 200 for muse_probe (47 input / 18 output tokens, 1.07s) and a substantive muse_advise task (140 input / 855 output tokens, 10.515s). Full unit suite: 180 passed. Desktop/mobile Muse workflows: 4 passed; existing council: 2 passed. Browser setup uses automatic matching and enables the on-demand pipeline; workspace authentication is still required to run tasks.

