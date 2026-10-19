"use client";
import {BossSettings} from "./boss-settings";
import {useEffect,useState} from "react";
import {parseBoss,bossPlanSchema,type BossPlan} from "@/lib/boss";
export function BossActions({text}:{text:string}){
 const parsed=parseBoss(text);const [edited,setEdited]=useState<BossPlan|null>(null),[selection,setSelection]=useState(""),[edit,setEdit]=useState(""),[run,setRun]=useState(""),[challenge,setChallenge]=useState(""),[consequences,setConsequences]=useState<string[]>([]),[packets,setPackets]=useState<{id:number;text:string;blocked:boolean;needs:string[]}[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[report,setReport]=useState("");
 const plan=edited||parsed.plan;
 const cacheKey="sovereign-boss-"+Array.from(text).reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261).toString(16);
 const [hydrated,setHydrated]=useState(false);
 useEffect(()=>{try{const raw=localStorage.getItem(cacheKey);if(raw){const saved=JSON.parse(raw);if(saved.source===text){setRun(saved.run||"");setEdited(saved.edited?bossPlanSchema.parse(saved.edited):null);setPackets(saved.packets||[]);setNotice(saved.notice||"");}}}catch{}setHydrated(true);},[cacheKey,text]);
 useEffect(()=>{if(!hydrated)return;try{localStorage.setItem(cacheKey,JSON.stringify({source:text,run,edited,packets,notice}));}catch{}},[cacheKey,text,run,edited,packets,notice,hydrated]);
 async function call(body:unknown){const r=await fetch("/api/boss",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error?.message||"Could not save Boss selection.");return data;}
 async function choose(go=false){if(!plan)return;setBusy(true);setError("");try{
 let id=run;if(!id){const result=await call({operation:"prepare",plan});id=result.run;setRun(id);}
 const value=selection.trim().toLowerCase();if(value.startsWith("edit ")){const number=Number(value.slice(5));const option=plan.options.find(o=>o.id===number);if(!option)throw Error("Choose an existing option number.");setEdit(JSON.stringify(option,null,2));return;}
 if(!go&&value!=="none"&&!/^\d+(?:\s*[+,]\s*\d+)*$/.test(value))throw Error("Use option numbers such as 1+3, edit 2, or none.");
 const result=await call(go?{operation:"confirm",run:id,challenge,confirmation:"GO"}:value==="none"?{operation:"none",run:id}:{operation:"select",run:id,selected:value.split(/[+,]/).map(Number)});
 setChallenge(result.challenge||"");setConsequences(result.consequences||[]);setPackets(result.packets||[]);setNotice(result.notice|| (result.status==="complete_without_action"?"Closed without action.":"Review the consequences, then confirm GO to release these packets."));
 }catch(e){setError(e instanceof Error?e.message:"Could not release packet.");}finally{setBusy(false);}}
 if(!plan)return <p role="status">Boss did not return a valid action menu. The deliverable is preserved. Retry the final editor to prepare selectable packets; nothing has executed.</p>;
 return <section aria-label="Boss action menu" className="boss-actions"><h3>Choose what happens next</h3><BossSettings/><p>Packets stay held until you select them. Release is manual handoff preparation, not execution.</p>
 {plan.options.length===0&&<p>No execution is needed for this answer.</p>}
 {plan.options.map(o=><div key={o.id} className="boss-option"><strong>{o.id}. {o.action}</strong><p>{o.executor==="MUSE"?"Aya (Muse personal agent)":o.executor} · Risk {o.risk} · Done when: {o.doneWhen}</p>{o.needs.length>0&&<p>BLOCKED pending connection verification: {o.needs.join(", ")}. Complete setup and approve a new packet before execution.</p>}<small>Packet {o.id} held for {o.executor}</small></div>)}
 <label>Reply with option number(s), 'edit N' to change a packet before release, or 'none'.<input aria-label="Boss selection" value={selection} placeholder="1+3" onChange={e=>{setSelection(e.target.value);setChallenge("");setConsequences([]);}}/></label><button disabled={busy} onClick={()=>void choose()}>Review selection</button>
 {challenge&&<div role="alert">{consequences.map(c=><p key={c}>{c}</p>)}<button disabled={busy} onClick={()=>void choose(true)}>GO — release selected packets</button></div>}
 {edit&&<div><label>Edit packet JSON<textarea aria-label="Edit Boss packet" rows={16} value={edit} onChange={e=>setEdit(e.target.value)}/></label><button onClick={()=>{try{const option=JSON.parse(edit);const next=bossPlanSchema.parse({options:plan.options.map(o=>o.id===option.id?option:o)});if(!plan.options.some(o=>o.id===option.id))throw Error("Keep the original option number.");setEdited(next);setRun("");setChallenge("");setPackets([]);setEdit("");setNotice("New packet version saved locally. Select again; previous approval does not apply.");}catch{setError("Invalid packet. Keep its number and all required fields.");}}}>Save new version and clear approval</button></div>}
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {packets.map(p=><details key={p.id} open><summary>Released packet {p.id}{p.blocked?" — connection verification required":""}</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{p.text}</pre><button onClick={()=>void navigator.clipboard.writeText(p.text).catch(()=>setError("Copy unavailable; select the packet text manually."))}>Copy packet {p.id}</button></details>)}
 {run&&<details><summary>Record executor report</summary><textarea aria-label="Executor report" rows={8} value={report} onChange={e=>setReport(e.target.value)} placeholder="Paste the packet report-back block"/><button disabled={busy} onClick={()=>{setBusy(true);void call({operation:"report",run,report}).then(r=>setNotice(r.notice)).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Save unverified report</button></details>}
 </section>;
}
