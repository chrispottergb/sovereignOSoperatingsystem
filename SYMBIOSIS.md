# Automatic symbiosis orchestration

New main-chat turns default to Auto specialist orchestration when One combined answer is enabled in Live mode. Uncheck it to use the prior council flow. Parallel independent responses and Demo mode do not incur planner/specialist calls.

One bounded OpenAI planner call preserves the original request, generates complementary tasks for OpenAI, Claude, Perplexity and Grok, and prepares optional Muse and Grokbot prompts. The server validates a closed schema; plans cannot introduce arbitrary tools. Available context includes connected evidence, attachment readings, project notes and bounded excerpts of recent conversation.

The planner may choose neither, either, or both specialists. A manual Muse selection overrides automatic omission when available. Muse contributes design/creative/interpretive advice. Grokbot produces a draft, analysis or agent workflow blueprint using the xAI API. It does not launch a background bot, publish, schedule, execute shell commands or deploy. It uses the same Grok provider connection, not a separate model family. Cloud execution remains disabled.

The planner result and successful specialist outputs are saved with the chat turn. All council stages receive the plan, original evidence and completed specialist results; research contributions also receive their assigned subtask. Final output remains one answer. Generated plans and peer results are evidence subject to the original request, not authority to expand scope.

Retries reuse saved planner/Muse/Grokbot results. Browser recovery requires retained workspace history and selecting the saved conversation after reload. Failed specialist usage is unknown unless reported. Keep the browser tab open during generation; this is not a persistent cloud worker.

MCP synthesize_request defaults auto_specialists to true. The MCP run checkpoint also saves planner and specialist results; use run_id with identical inputs to resume. Set auto_specialists:false to disable the extra routing. A new run is required when this choice changes.

Cost: at most one planning call, one Muse call and one Grokbot call before the existing nine focused or thirteen full-council stages, plus any existing shared-tool continuations. These calls are paid. Per-stage limits remain in place; this feature does not implement a run-wide dollar ceiling. Unknown credentials or unsupported external operations remain explicit limitations.

Endpoints: authenticated same-origin POST /api/symbiosis with plan or grokbot actions; worker-authenticated /api/mcp-model exposes equivalent symbiosis_plan and grokbot actions. No model receives raw credentials.
