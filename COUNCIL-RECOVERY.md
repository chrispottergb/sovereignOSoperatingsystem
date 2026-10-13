# Council recovery

The MCP `synthesize_request` tool now writes private local checkpoints under `MCP_WORKSPACE_DIR/.council-runs/<run_id>`. These files are excluded from the shared-file catalog; retain the MCP workspace to retain recovery history. They contain prompts and responses, so treat them as private project data. They are not cloud backups.

A failed run returns its run ID. Explicitly call the tool again with `run_id` and the same task, constraints, depth, editor, connector IDs, Muse choice and spending mode. Successful provider calls and previously read evidence are reused. Missing/failed calls may be billed again. No automatic council retry or editor substitution is performed. Upstream overload rejection retries in the existing HTTP adapter are unchanged.

New input requires a new run. Completed context and tool snapshots remain fixed on resume; use a new run to refresh external evidence. Each attempt is retained. A process crash can leave an attempted call with unknown upstream completion/billing. Resume is not an exactly-once billing guarantee. A local process lock prevents simultaneous resumes; after process exit a subsequent attempt can reclaim the lock.

`spending_mode` is independent of `depth`, defaults to `economy`, and can be `thorough`. Focused/full still use nine/thirteen baseline stages. Tool continuations and Muse add calls. This increment does not implement an aggregate dollar budget, change the council topology, or enable cloud workers.

Dashboard workflows already reuse successful contributions/reviews/corrections from browser history. Their persistence remains separate from these MCP checkpoints. Keep the tab open during dashboard generation. Provider diagnostics and upstream Claude model reporting apply to both paths; structured failed-call usage metadata is returned by the authenticated MCP gateway.

Run-wide budgets, unified cloud checkpoints, automatic background execution, and capability health probes remain follow-up work. Credential presence is not an access check.

Live diagnosis: a Claude review exhausted its 1200-token allowance. Completion now classifies unfinished output as INCOMPLETE rather than a generic connection error. Claude critique limits are 4096 tokens in economy and 6144 in thorough mode; other stage limits are unchanged. This is an allowance, not a claim about visible answer length or guaranteed completion.

Shared tool results acquired during contributions are now included in subsequent reviews, corrections and final synthesis. Initial contributions remain independent. Later stages resolve ambiguity against actual retrieved evidence rather than counting repeated objections as proof of a missing source. Shared evidence remains bounded to 30,000 characters and frozen in the run checkpoint.
