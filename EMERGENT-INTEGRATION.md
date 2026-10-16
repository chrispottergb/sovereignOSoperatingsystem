# Emergent build workspace

Implemented: `/emergent`, private immutable Supabase artifact briefs, handoff from a council answer, manual copy to Emergent, and explicit paid four-provider review through the existing durable Orchestra pipeline. No provider credentials or new database migration are needed for this increment.

Direct OAuth / remote job execution is NOT connected. Discovery at https://mcp.emergent.sh/.well-known/oauth-authorization-server returned HTTP 403 from the development environment on 2026-10-15. Do not fabricate tool names, OAuth endpoints, completion, or spending limits. Official connector documentation: https://emergent.sh/blog/emergent-mcp-connector . Publishing is outside the connector.

Next integration gate: reach official protected-resource discovery, verify authorization server metadata and client registration support, implement encrypted server-side OAuth with PKCE/state, discover actual tool schemas after owner consent, and map supported operations to a separate external-job adapter. Do not route Emergent into the Codex/Claude Railway sandbox code. Track provider job IDs and ambiguous submissions without automatic retries. Require explicit approval for initial paid builds. Verify provider-side limits before advertising any credit cap.

Saved brief status `prepared` does not imply submission. Owner-supplied reports are unverified evidence; council agreement does not verify tests. The review explicitly preserves original scope and dissent and does not authorize another build or deployment. Existing council specialist planning remains responsible for conditional Muse/Grokbot contributions; Emergent is a builder, not a fifth reviewer.
