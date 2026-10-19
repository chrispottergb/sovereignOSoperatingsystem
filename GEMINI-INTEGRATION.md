# Gemini council adviser

Set GEMINI_API_KEY in Vercel Production and redeploy. Optional GEMINI_MODEL overrides the default gemini-3.8-flash. Presence does not establish billing or model access.

In the main chat select One combined answer and Include Gemini adviser (+1 call). Gemini receives the prompt, project notes, shared evidence and attachment brief. Its bounded contribution is persisted with the turn and supplied to all council stages as unverified model output. Completed contributions are reused on retry. Failures pause the run without automatic paid retries. The original four providers remain the reviewers and final editors.

MCP: sovereign_gemini_advice accepts prompt and context. synthesize_request accepts use_gemini:true and checkpoints its contribution. Gemini does not gain external execution tools or direct raw-media access in this increment. Credentials stay server-side.

Google endpoint: https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
Documentation: https://ai.google.dev/gemini-api/docs/openai
