# Aya email bridge

MCP tool: handoff_to_aya. Inputs: task_name, action, destination, content, timing, approval. One task and one Resend email request per call. Approval accepts only Chris approved, needs Chris's approval, or draft only. The caller must have explicit Chris authorization for any Chris approved claim; the enum is not proof of approval.

The MCP process routes through SOVEREIGN_ORIGIN and WORKER_SECRET to the authenticated /api/mcp-model handler. RESEND_API_KEY and AYA_FROM_EMAIL stay in Vercel Production. Restart the MCP process after updating the code to discover the new tool. No separate Resend credential is needed on Railway or in the client MCP process.

Recipient is fixed to drpotterbeatz@gmail.com. Subject is [FOR AYA] followed by task_name. Body has ACTION, DESTINATION, CONTENT, TIMING (timezone America/Chicago), APPROVAL fields. Reply-To is the same owner Gmail inbox so replies to the test sender stay accessible to the owner.

A successful provider acknowledgment returns exactly {"status":"submitted"}. It does not mean delivered, read, executed, or completed. Aya must reply in the same email thread with proof before completion can be claimed. There is no inbox polling or automatic reply verification in this sending-only increment.

No automatic retries. Timeouts/unreadable confirmations are uncertain: inspect Resend and the inbox before submitting again. Each deliberate tool call sends one email; re-invoking the tool is a new send. Tools must not invent approvals or batch actions.

The onboarding@resend.dev sender is test-only and can send only to the Resend account owner's address. If Resend rejects this recipient, configure a verified domain instead. Reference: https://resend.com/docs/knowledge-base/403-error-resend-dev-domain

Validation: mocked sender tests verify exact payload, no-secret configuration failures, validation, provider rejection, and no retries. Full unit suite 225 passed; TypeScript passed.

Deployment base is f635562 (the live deployment's source). Newer Claude work on claude-handoff-cloud-builds is preserved separately; cherry-pick this email-only commit to combine the changes. No cloud-build migration is required for this bridge.
