# Aya Gmail bridge

Active MCP tool: handoff_to_aya. Gmail replaces Resend at Chris's request. No automatic fallback to Resend. Inputs: task_name, action, destination, content, timing, approval. One task and one Gmail send request per call. Approval accepts only Chris approved, needs Chris's approval, or draft only; callers must not invent authorization.

## Connect

Open https://sovereign-ai-workspace-zeta.vercel.app/aya after unlocking the workspace.
1. Enable Gmail API in a Google Cloud project.
2. Configure Google Auth Platform audience/branding. Add drpotterbeatz@gmail.com as a test user if Testing.
3. Create a Web application OAuth client with exact redirect https://sovereign-ai-workspace-zeta.vercel.app/api/aya-gmail/callback.
4. Save GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel Production, then redeploy. Never paste secrets in chat.
5. Click Connect Gmail and authorize drpotterbeatz@gmail.com. Only gmail.send and OpenID email identity are requested. Inbox reading is not authorized.
6. Click Send one test ping once. Connection alone never sends email. Google Testing apps may require reconnecting after seven days.

## Implementation

Owner session and same-origin POST protect authorization initiation. OAuth state is encrypted, expires in ten minutes, and is bound to a Secure/HttpOnly/SameSite=Lax host cookie; PKCE binds the code exchange. The callback verifies the Google account email and granted send scope before saving a refresh token encrypted with CONNECTOR_ENCRYPTION_KEY. The singleton Supabase credential table has RLS and service-role-only grants. Migration 202610150002_aya_gmail.sql was applied through Supabase Management API; do not replay prior migrations.

The MCP uses SOVEREIGN_ORIGIN and WORKER_SECRET to call /api/mcp-model. Google secrets stay on Vercel; the refresh token stays encrypted in Supabase. Restart an existing MCP process after updating code to discover the tool.

Sender, recipient and Reply-To are fixed to drpotterbeatz@gmail.com. Subject is [FOR AYA] followed by task_name. UTF-8 MIME body preserves ACTION, DESTINATION, CONTENT, TIMING (timezone America/Chicago), APPROVAL. A successful Gmail acknowledgment returns exactly {"status":"submitted"}; it does not mean delivered, read, executed, or completed. Aya must reply in the same thread with proof. No inbox polling or automatic reply verification is implemented.

No automatic send retries. If submission is uncertain, inspect Gmail Sent and the inbox before invoking again. Separate deliberate tool calls are separate sends. UI prevents repeating the ping during that page session, not across page reloads.

Validation: 232 unit tests, TypeScript and lint passed. Google live authorization and the Gmail ping remain pending credentials/consent. Earlier Resend ping was rejected with HTTP 403, not submitted.

This branch preserves the deployed f635562 baseline plus the Aya bridge. Claude's newer cloud-build work remains on claude-handoff-cloud-builds; merge or cherry-pick the Aya commits to combine them, not a force push.

Official references:
https://developers.google.com/workspace/gmail/api/auth/web-server
https://developers.google.com/identity/protocols/oauth2/web-server
