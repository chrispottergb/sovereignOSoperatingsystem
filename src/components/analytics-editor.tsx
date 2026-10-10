"use client";
import { useState } from "react";
import { analyticsSchema, type Workspace } from "@/lib/contracts";
export function AnalyticsEditor({ analytics, onSave }: { analytics?: Workspace["analytics"]; onSave: (value: Workspace["analytics"]) => void }) {
  const [platform, setPlatform] = useState(analytics?.platform || "Instagram and Facebook");
  const [period, setPeriod] = useState(analytics?.period || "");
  const [data, setData] = useState(analytics?.data || "");
  const [error, setError] = useState("");
  return <form className="modal-form" onSubmit={e => { e.preventDefault(); const result = analyticsSchema.safeParse({ platform, period, data }); if (!result.success) { setError("Add a platform, reporting period and analytics data (up to 16,000 characters)."); return; } onSave(result.data); }}>
    <p className="modal-intro">Add an Instagram/Facebook export from Meta Business Suite. All four models review the same dated snapshot independently. Direct account sync is not connected. Telegram is planned for later.</p>
    <label>Platforms<input value={platform} onChange={e => setPlatform(e.target.value)} maxLength={80} required/></label>
    <label>Reporting period<input value={period} onChange={e => setPeriod(e.target.value)} maxLength={120} placeholder="e.g. September 2026, compared with August 2026" required/></label>
    <label>Import a text or CSV export<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 64000) { setError("Choose a smaller export or paste a summary of up to 16,000 characters."); return; } const value = await file.text(); if (value.length > 16000) { setError("The export is too long. Paste the relevant rows with column headers."); return; } setData(value); setError(""); }}/></label>
    <label>Analytics data<textarea rows={8} value={data} onChange={e => setData(e.target.value)} maxLength={16000} required placeholder="Include column headers, dates, reach, impressions, engagement, link clicks and conversions where available. Keep credentials and personal audience records out."/></label>
    <p className="settings-note">Saved in this browser and shared with all four providers during a live master run. Public trend research does not provide private account analytics. Existing runs keep their original snapshot.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => onSave(undefined)}>Remove snapshot</button><button className="primary-button">Save analytics snapshot</button></div>
  </form>;
}
