# Six-member SovereignOS council

OpenAI, Claude, Perplexity, Grok, Gemini and Muse are full participants. Each independently answers the original request. Each reviews all other five answers with its own answer excluded. Focused mode uses 6 answers + 6 cross-reviews + 1 final editor = 13 calls. Full council adds six corrections = 19 calls. Optional orchestration, Grokbot or attachments add their own calls. One selected Claude/OpenAI editor delivers the actionable result. Model agreement does not establish external verification or authorize execution.

Gemini uses GEMINI_API_KEY and optional GEMINI_MODEL (default gemini-3.8-flash). Muse uses MUSE_API_KEY or MODEL_API_KEY and optional MUSE_MODEL (default muse-spark-1.3). Their council adapters are text-only, use shared attachment briefs and have no native search or external execution tools. Both receive all peer outputs for review. They are no longer extra adviser calls in council runs. Standalone adviser MCP tools remain available for explicit use.

Browser retries reuse completed work. An old four-member run adds missing Gemini/Muse assessments and regenerates reviews for all six before final synthesis. MCP checkpoints are versioned: start a new run rather than reusing an old four-member MCP checkpoint ID. Core roles and configured keys must be available for all six. Existing music/build dashboards remain separate.
