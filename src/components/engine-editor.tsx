"use client";
import { useState } from "react";
import { providerIds, providers, type Engine, type ProviderId } from "@/lib/contracts";
import { defaultEngine } from "@/lib/engine";
function exportFile(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function EngineEditor({ engine, onSave }: { engine?: Engine; onSave: (engine: Engine) => void }) {
  const [draft, setDraft] = useState<Engine>(() => ({ profiles: { ...defaultEngine.profiles, ...engine?.profiles } }));
  const [provider, setProvider] = useState<ProviderId>("grok");
  const profile = draft.profiles[provider]!;
  function patch(values: Partial<typeof profile>) { setDraft(d => ({ profiles: { ...d.profiles, [provider]: { ...d.profiles[provider]!, ...values } } })); }
  return <form className="modal-form" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
    <p className="modal-intro">The master model uses these profiles to assign work for each prompt. These are editable starting roles, not measured rankings. Grok bots and Claude skills here are reusable instructions; they do not execute code or deploy services.</p>
    <label>Model profile<select aria-label="Model profile" value={provider} onChange={e => setProvider(e.target.value as ProviderId)}>{providerIds.map(id => <option key={id} value={id}>{providers[id].name}{id === "grok" ? " bot" : id === "claude" ? " skill" : " role"}</option>)}</select></label>
    <label>Profile name<input value={profile.name} onChange={e => patch({ name: e.target.value })} maxLength={80} required/></label>
    <label>Role and skill instructions<textarea rows={8} value={profile.instructions} onChange={e => patch({ instructions: e.target.value })} maxLength={5000}/></label>
    <p className="settings-note">Saved locally and included in future requests to this model. Keep credentials out. Existing conversations retain their saved role settings.</p>
    <div className="modal-actions">
      <button type="button" className="secondary-button" onClick={() => patch(defaultEngine.profiles[provider]!)}>Use default role</button>
      {provider === "claude" && <button type="button" className="secondary-button" onClick={() => exportFile("SKILL.md", `---\nname: workspace-review\ndescription: ${JSON.stringify(profile.name + ". Use when the user requests this workspace review skill.")}\n---\n\n# ${profile.name}\n\n${profile.instructions}\n`)}>Export Claude skill</button>}
      {provider === "grok" && <button type="button" className="secondary-button" onClick={() => exportFile("grok-bot-profile.json", JSON.stringify({ provider: "grok", ...profile }, null, 2))}>Export Grok profile</button>}
    </div>
    <button className="primary-button" disabled={providerIds.some(id => !draft.profiles[id]?.name.trim())}>Save engine profiles</button>
  </form>;
}
