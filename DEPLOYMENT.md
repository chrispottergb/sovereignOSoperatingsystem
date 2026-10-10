# Deploy sovereignOS to Vercel

## Grok and master workflow

Grok uses `XAI_API_KEY` and the optional `XAI_MODEL` (default `grok-4.7`) with xAI's Responses API and `store: false`. See [xAI's documentation](https://docs.x.ai/developers/model-capabilities/text/generate-text). Keys remain server-side.

Enable **Build a master plan** to run the research, debate and agreement workflow described below. All four providers participate. Keep the browser tab open.

Research, debate rounds, votes, escalation reviews and locked assignments remain inspectable in local history. **Stop workflow** cancels active calls and prevents later phases. Missing required evidence or reviews blocks the plan. Consensus is not factual verification; model profiles are starting roles, not measured rankings.

**Model roles, bots & skills** edits one reusable named profile per provider. The Grok bot and Claude skill are instruction profiles inside this app. Export the Grok profile as JSON or the Claude skill as `SKILL.md`. They do not provision external bots, run arbitrary code, or grant deployment permissions. History export includes critiques; workspace backups include profiles and assignments. Older workspace backups remain supported.

This is a private, single-owner multi-model workspace. API keys stay on the server. Chats and project notes stay in this browser's local storage; they do not sync across devices. A successful build does not verify your provider billing or model access.

## 1. Import the app

- Put the contents of the `sovereign-os` folder in a private Git repository, including `package-lock.json`. Do not upload `.env.local`, `node_modules`, or `.next`.
- In Vercel, select **Add New > Project**, then import that repository.
- Use the settings below. If your repository contains this folder at a deeper path, select that path as Root Directory.

| Vercel setting | Value |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | Folder containing this app's `package.json` (`./` when uploaded at repository root) |
| Node.js Version | 24.x |
| Install Command | `npm ci` (configured in `vercel.json`) |
| Build Command | `npm run build` (configured in `vercel.json`) |
| Output Directory | Leave the Next.js default; do not use `out` or static export |
| Fluid Compute | Enabled in `vercel.json` |

The generation route is configured for a 300-second maximum and request cancellation. Keep the app request timeout at 180 seconds so an upstream timeout can be returned before the host terminates the function.

If you do not want a Git repository yet, you can deploy the same folder with Vercel CLI after signing in: run `npx vercel link` from the app folder, add the variables below to the linked project in the Vercel browser dashboard, then run `npx vercel --prod`. This uploads the app and creates a production deployment. These commands are instructions for your deployment step; preparing this project does not publish it automatically. The included `.vercelignore` excludes local secrets and build caches.

## 2. Add server environment variables

Add these under **Project Settings > Environment Variables**, selecting **Production**. Mark provider keys and the workspace password as sensitive where the UI offers that option. Do not prefix any of these names with `NEXT_PUBLIC_`. Do not paste keys into chat or into the source code.

| Name | Exact value to enter / where to get it |
| --- | --- |
| `OPENAI_API_KEY` | Your OpenAI API project key; an API account with billing and model access is required |
| `ANTHROPIC_API_KEY` | Your Anthropic Console API key with API billing and model access |
| `PERPLEXITY_API_KEY` | Your Perplexity API key with API credits/billing |
| `XAI_API_KEY` | Your xAI API key with model access and API credits |
| `XAI_MODEL` | Optional; defaults to `grok-4.7` |
| `APP_PASSWORD` | A unique random workspace password, at least 16 characters; preferably 32+ characters from your password manager |
| `APP_ORIGIN` | Your exact canonical site origin, for example `https://your-project.vercel.app`; no path, query, or trailing slash |
| `APP_LOCAL_ONLY` | `false` |
| `ENABLE_DEMO` | `true` to try the clearly labeled sample responses; `false` to disable them |
| `MAX_OUTPUT_TOKENS` | `4096` |
| `REQUEST_TIMEOUT_MS` | `180000` |

The four keys turn on the respective live providers. You can deploy without them to try demo mode; live calls to an unconfigured provider will be unavailable. `APP_PASSWORD` and a valid deployment origin are required to unlock a public production deployment.

Model settings are optional server variables: `OPENAI_MODEL`, `ANTHROPIC_MODEL`, and `PERPLEXITY_PRESET`. See `.env.example` for this version's defaults. Override a model only with an identifier available to your API account. Perplexity uses the Agent API preset `fast` by default.

Optional cost estimates: `OPENAI_INPUT_USD_PER_MILLION`, `OPENAI_OUTPUT_USD_PER_MILLION`, `ANTHROPIC_INPUT_USD_PER_MILLION`, and `ANTHROPIC_OUTPUT_USD_PER_MILLION`. Leave them unset unless you have verified the price of the selected model. Estimates exclude search/tools and other additional charges. Perplexity uses provider-reported cost when supplied.

Leave `MCP_CONTEXT_FILE` unset on Vercel. The local stdio MCP helper is a separate process for local AI clients, not a hosted remote MCP endpoint. No Supabase variables are needed for this version. CLI subscriptions and local CLI login do not provide credentials to this deployed server.

## 3. Deploy and check

1. Deploy. If the assigned domain differs from `APP_ORIGIN`, set `APP_ORIGIN` to the actual domain and redeploy. A first deployment can safely show the setup screen while you finish this setting.
2. Open the configured canonical domain and unlock with `APP_PASSWORD`.
3. Run a prompt with all four providers in demo mode. Verify streaming, retry/cancel, and synthesis.
4. Switch to live mode and make a short request to each configured provider. This is the first check of your actual key, billing, and model permissions.
5. Run synthesis, reload to confirm local history, and check the mobile layout.
6. Log out and verify live requests require unlocking again.

Environment changes apply to new deployments: redeploy after adding or changing keys, password, model, or origin. If you add a custom domain, update `APP_ORIGIN` and use that domain consistently.

## Preview environments

Production secrets are not automatically a recommendation to share them with every preview. Use separate limited-budget provider keys and a different password if you enable live preview environments. Configure Preview variables explicitly. With an explicit `APP_ORIGIN`, open that exact origin; other preview/alias origins are rejected. Never use `APP_LOCAL_ONLY=true` on Vercel.

## Operating limits

The included request limiter is per server process. Vercel can run multiple instances, so this is not a global usage quota. The password gate is intended for one owner. Before sharing with multiple users, add user authentication, a durable shared rate limiter, usage budgets, and server-side history storage. Set provider spending limits for your API accounts.

## Official references

The included GitHub workflow runs install, lint, unit tests, and a production build on pushes and pull requests once the app is at repository root. If you keep it in a subdirectory, adjust the workflow working directory and npm cache dependency path to match that directory.

- [Vercel build settings](https://vercel.com/docs/builds/configure-a-build)
- [Vercel environment variables and redeployment](https://vercel.com/docs/environment-variables)
- [Vercel supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel function configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Next.js server-only environment variables](https://nextjs.org/docs/app/guides/environment-variables)

## Research council and decision gates

Master mode always uses all four providers. It performs four independent native web-search requests, requires completed research with provider-returned source links in live mode, and then conducts up to three debate rounds. Each round has four critiques, one candidate proposal and four structured votes. Tasks lock only when all four approve the exact candidate with no objections and all evidence, feasibility, impact, efficiency and task-fit checks passing.

After three rejected rounds, GPT Astra (`gpt-6-astra`) proposes a resolution; Claude Fable 5.1 (`claude-fable-5-1`) reviews that exact candidate. Neither review automatically locks tasks. The owner must enter a reason and approve in the UI. The resulting plan is labelled owner-approved after review, not unanimous agreement. Missing/invalid/truncated research, proposals, votes or escalation reviews block progression. Cancellation and reload stop further calls.

Maximum per initial run: 34 model requests if escalated and owner-approved, plus provider search charges and bounded provider overload retries. Manually running a locked task adds one request; restarting creates fresh research and may incur the full cost again. Keep the browser tab open. Provider billing/model access and Claude web-search permission must be enabled in the respective API accounts.

Instagram/Facebook analytics currently use a dated owner-supplied CSV/text snapshot, entered through Social analytics & connectors. The models receive the same snapshot independently; missing private analytics are disclosed. Native account OAuth/sync, Telegram, persistent background bots and external publishing are not connected. Run task produces a draft/work product inside SovereignOS, without external side effects. Never enter credentials in prompts, profiles or analytics exports.

Routing, drafts, critiques and votes are application data, not commands. No arbitrary generated connector code is executed. Current provider APIs are explicit server-side adapters; adding social/Telegram authorization and durable job storage is separate work.


Research-stage failures can resume for 24 hours using the original prompt, context, profiles and analytics snapshot. Only incomplete or uncited research reruns; completed research is preserved. Research older than 24 hours, ordinary responses, and runs that already reached proposals cannot use this shortcut. Final plans and workflow status are displayed above research briefs. Social account access is not a prerequisite for drafting a campaign with explicit assumptions.
