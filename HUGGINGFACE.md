# Hugging Face specialist integration

Verified 2026-10-20 against the public HF router catalog and publisher model cards. This is a task-oriented frontier shortlist, not an independently established universal top-five ranking. Publisher benchmarks use differing harnesses and cannot prove the best model for this workspace.

| Model | Intended role | Weight license |
|---|---|---|
| [DeepSeek V4 Pro](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro) | Reasoning, technical analysis | MIT |
| [Qwen3.8](https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B) | General research and coding | Custom Qwen3.8-Max |
| [GLM-5.3](https://huggingface.co/zai-org/GLM-5.3) | Coding and long-task planning | Custom GLM-5.3 |
| [Kimi K3](https://huggingface.co/moonshotai/Kimi-K3) | Long-context knowledge work | Custom Kimi K3 |
| [MiniMax M3](https://huggingface.co/MiniMaxAI/MiniMax-M3) | Efficient drafting and coding | MiniMax community |

Selection considers current hosted availability, publisher-reported capabilities, complementary strengths and integration practicality. All five appeared in https://router.huggingface.co/v1/models with live providers. Availability can change. Custom licenses are not equivalent to unrestricted open source. This integration does not download weights or provision GPUs.

## Activate later
Create a Hugging Face token at https://huggingface.co/settings/tokens with Inference Providers permission. Save it in Vercel Production as HF_TOKEN, then redeploy. Never put it in client-side NEXT_PUBLIC variables. The UI reports token presence only, not a successful paid capability test. Provider billing/credits and any account or model access conditions still apply.

## Flow
Hugging Face specialist dropdown → one selected model report → selected Claude/OpenAI Boss → one final answer with held action choices. The existing six-model council remains available. Specialist reports are saved in the browser turn record; a Boss retry reuses that report. No automatic specialist fan-out or external execution. Each inference POST requires owner authentication and same-origin validation.

The fixed HF router uses the documented :cheapest selection policy (lowest output-token pricing, not a guarantee of lowest total bill). One request per report; 4,096 output-token ceiling, 12,000-character prompt, 40,000-character context, 180-second server deadline and no automatic retry. Truncated/empty reports are rejected before Boss. Usage is saved when reported. This is not a hard dollar budget and provider internal billing may differ.

Only text and the existing attachment briefs are sent. Native media, browsing, tool-call execution and remote code execution are not implemented here, regardless of model-card capabilities. Synthesized reports are untrusted evidence; Boss cannot verify unsupported claims without actual evidence. Selection of handoff packets does not execute them.

Docs: https://huggingface.co/docs/inference-providers/index

## Verification
Unit coverage: all five allowlisted routes, missing key, unknown model, truncation, no automatic retry, authentication and Boss reuse. Browser fixtures: selection with only Boss configured, interrupted final review, report reuse, hidden report and visible final on desktop/mobile. No paid inference calls or new credentials were used during implementation. Activate and run a small smoke test before relying on a provider.
