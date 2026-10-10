"use client";
import {useEffect,useState} from 'react';
import {specialistRegistry,type SpecialistJob} from '@/lib/specialists';
type State={configured:boolean;enabled:boolean;runnerOnline:boolean;setup?:string;jobs:SpecialistJob[]};
export function SpecialistPanel({turnId,prompt,live}:{turnId:string;prompt:string;live:boolean}){
 const [state,setState]=useState<State>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[caption,setCaption]=useState(prompt.slice(0,4000)),[lyrics,setLyrics]=useState(''),[seconds,setSeconds]=useState(30),[bpm,setBpm]=useState(90),[seed,setSeed]=useState(42);
 const [requestId,setRequestId]=useState<string>();
 useEffect(()=>{const abort=new AbortController();async function poll(){try{const r=await fetch('/api/specialists?turn='+turnId,{cache:'no-store',signal:abort.signal});const data=await r.json();if(!r.ok)throw Error(data.error?.message||'Specialists unavailable.');setState(data);}catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Specialists unavailable.');}}void poll();const timer=setInterval(()=>void poll(),10000);return()=>{abort.abort();clearInterval(timer);};},[turnId]);
 async function action(body:unknown){setBusy(true);setError('');try{const r=await fetch('/api/specialists',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error?.message||'Specialist request failed.');const refresh=await fetch('/api/specialists?turn='+turnId,{cache:'no-store'});if(refresh.ok)setState(await refresh.json());return true;}catch(e){setError(e instanceof Error?e.message:'Specialist request failed.');return false;}finally{setBusy(false);}}
 function changed(){setRequestId(undefined);}
 async function generate(){const id=requestId||crypto.randomUUID();setRequestId(id);await action({action:'generate_music',input:{requestId:id,sourceTurnId:turnId,prompt:caption,lyrics,seconds,bpm,seed,environment:'local'}});}
 return <details className="review-details"><summary>Create music from this conversation</summary>
 <p>One shared music connection for OpenAI, Claude, Perplexity and Grok. Generated audio returns here. Cloud execution is disabled.</p>
 {state?.setup&&<p role="status">{state.setup}</p>}
 <p>Local music worker: {state?.runnerOnline?'ready':'offline or not configured'}. One track per job, up to 120 seconds; 600 requested seconds per rolling day. No automatic retries.</p>
 <button className="secondary-button" disabled={busy||!live||!state?.configured} onClick={()=>void action({action:'toggle',enabled:!state?.enabled})}>{state?.enabled?'Disable music for all four models':'Enable music for all four models'}</button>
 <div className="modal-form">
 <label>Music direction<textarea rows={3} maxLength={4000} value={caption} onChange={e=>{setCaption(e.target.value);changed();}}/></label>
 <label>Lyrics (leave blank for instrumental)<textarea rows={2} maxLength={4000} value={lyrics} onChange={e=>{setLyrics(e.target.value);changed();}}/></label>
 <div className="studio-actions"><label>Duration (seconds)<input type="number" min={10} max={120} value={seconds} onChange={e=>{setSeconds(Number(e.target.value));changed();}}/></label><label>Tempo (BPM)<input type="number" min={30} max={300} value={bpm} onChange={e=>{setBpm(Number(e.target.value));changed();}}/></label><label>Seed<input type="number" min={0} max={2147483647} value={seed} onChange={e=>{setSeed(Number(e.target.value));changed();}}/></label></div>
 <button className="secondary-button" disabled={busy||!live||!state?.enabled||!state.runnerOnline||caption.trim().length<3} onClick={()=>void generate()}>{busy?'Working…':requestId?'Check / recover this request':'Generate music locally'}</button>
 {requestId&&<button className="secondary-button" disabled={busy} onClick={changed}>Prepare a new generation</button>}
 </div>
 {error&&<p role="alert">{error}</p>}
 {state?.jobs.map(job=><section key={job.id} className="studio-item"><strong>Music · {job.status}</strong><p>{job.stage}</p>{['queued','running'].includes(job.status)&&<button className="secondary-button" disabled={busy} onClick={()=>void action({action:'cancel',id:job.id})}>Cancel job</button>}{job.error&&<p role="alert">{job.error}</p>}{job.status==='completed'&&<><audio controls preload="none" src={'/api/specialists/audio?id='+job.id} aria-label="Generated music"/><p><a href={'/api/specialists/audio?id='+job.id} download>Download music</a></p><p>Generation completed. No brain effects, acoustic measurements or therapeutic benefits have been verified.</p><details><summary>Reproducibility record</summary><pre>{JSON.stringify({settings:job.input,sha256:job.artifact_sha256,provenance:job.provenance},null,2)}</pre></details></>}</section>)}
 <p>Cancellation stops this workflow and discards subsequent results; ACE-Step may continue computing locally because its documented API has no cancellation endpoint.</p>
 <details><summary>Specialist library</summary><ul>{specialistRegistry.map(model=><li key={model.id}><a href={'https://huggingface.co/'+model.model} target="_blank" rel="noreferrer">{model.model}</a> · {model.operation} · {model.implemented?'adapter implemented; local setup required':'planned; not executable'} · {model.license}</li>)}</ul></details>
 </details>;
}
