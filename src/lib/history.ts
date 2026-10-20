import { workspaceSchema, type Workspace, type Conversation, type Message, type ProviderId } from "./contracts";
export const STORAGE_KEY = "sovereign-os.workspace.v1";
export function emptyWorkspace(): Workspace { return { version: 1, projects: [{ id: "personal", name: "Personal workspace", notes: "" }], conversations: [] }; }
export interface HistoryRepository { load(): Promise<Workspace>; save(workspace: Workspace): Promise<void> }
export function restoreWorkspace(raw: string): Workspace {
  const parsed = workspaceSchema.parse(JSON.parse(raw));
  if (new Set(parsed.projects.map(p => p.id)).size !== parsed.projects.length || new Set(parsed.conversations.map(c => c.id)).size !== parsed.conversations.length || parsed.conversations.some(c => !parsed.projects.some(p => p.id === c.projectId))) throw new Error("Invalid workspace relationships.");
  for (const conversation of parsed.conversations) for (const turn of conversation.turns) {
    if(turn.unified)continue;
    for (const answer of [...Object.values(turn.answers), ...Object.values(turn.reviews ?? {}), ...Object.values(turn.revisions ?? {}), ...Object.values(turn.votes ?? {}), ...Object.values(turn.botRuns ?? {}), ...(turn.arbitration ? [turn.arbitration] : []), ...(turn.audit ? [turn.audit] : []), ...(turn.routing ? [turn.routing] : []), ...(turn.synthesis ? [turn.synthesis] : [])]) if (answer?.status === "streaming") { answer.status = "cancelled"; answer.error = "Interrupted when this workspace closed. Retry to continue."; }
    if (turn.council && ["researching", "routing", "answering", "reviewing", "voting", "planning", "arbitrating", "auditing"].includes(turn.council.status)) { turn.council.status = "cancelled"; turn.council.message = "Review stopped when the workspace closed. Run the review again to continue."; }
  }
  return parsed;
}
export class BrowserHistoryRepository implements HistoryRepository {
  async load() { const raw = localStorage.getItem(STORAGE_KEY); return raw ? restoreWorkspace(raw) : emptyWorkspace(); }
  async save(workspace: Workspace) { localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace)); }
}
export function historyFor(conversation: Conversation, turnId: string, provider: ProviderId): Message[] {
  const prior = conversation.turns.slice(0, conversation.turns.findIndex(t => t.id === turnId));
  const pairs = prior.filter(t => t.answers[provider]?.status === "complete").map(t => [{ role: "user" as const, content: t.prompt }, { role: "assistant" as const, content: t.answers[provider]!.text }]);
  const kept = pairs.slice(-12);
  while (kept.flat().reduce((n, m) => n + m.content.length, 0) > 90000) kept.shift();
  return kept.flat();
}
