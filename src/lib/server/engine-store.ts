import 'server-only';
import {createHash} from 'node:crypto';
import {engineInput,type EngineInput,type EngineRun,type EngineState} from '../unified-engine';
import {engineRegistry,invokeEngineModel} from './engine-models';
import {initialEngineState,nextEngineStage,acceptEngineStage,finishEngine,stageFitsBudget,type Stage} from './engine-machine';
import {db} from './astra-store';
import {AppError,publicError} from './errors';
import {connectorSnapshot} from './connector-hub';
type StoredState=EngineState&{pending?:Stage};
export async function engineReady(){try{await db('sovereign_engine_runs?select=id&limit=0');return true;}catch{return false;}}
export async function engineRead(owner:string,id:string){const rows=await db<EngineRun[]>(`sovereign_engine_runs?id=eq.${id}&owner=eq.${encodeURIComponent(owner)}`);if(!rows[0])throw new AppError('NOT_FOUND','Saved engine run not found.',404);return rows[0];}
export async function engineList(owner:string){return db<EngineRun[]>(`sovereign_engine_runs?owner=eq.${encodeURIComponent(owner)}&order=created_at.desc&limit=30`);}
export async function engineCreate(owner:string,raw:unknown){
 const input=engineInput.parse(raw),requestHash=createHash('sha256').update(JSON.stringify(engineInput.parse(raw))).digest('hex');
 const reuse=(run:EngineRun)=>{if(run.state.requestHash&&run.state.requestHash!==requestHash)throw new AppError('RUN_CONFLICT','This request ID is already bound to different inputs.',409);return run;};
 const prior=await db<EngineRun[]>(`sovereign_engine_runs?owner=eq.${encodeURIComponent(owner)}&client_id=eq.${input.clientId}`);if(prior[0])return reuse(prior[0]);
 if(!input.reporter&&input.maxCalls<10)throw new AppError('BUDGET','Cooperative review requires a budget of at least 10 calls; a single reporter needs two.',400);
 const registry=engineRegistry(),eligible=registry.filter(r=>r.configured&&(!input.candidates||input.candidates.includes(r.id))).map(r=>r.id);
 if(!registry.some(r=>r.id===input.editor&&r.configured))throw new AppError('MISSING_EDITOR','The selected Boss editor needs a configured API key.',503);
 if(input.reporter&&!eligible.includes(input.reporter))throw new AppError('MISSING_REPORTER','The requested reporter is not configured.',503);
 if(!eligible.length)throw new AppError('NO_MODELS','No configured contributors are available.',503);
 const connectors=await db<{id:string}[]>('astra_connectors?enabled=eq.true&permissions=cs.%5B%22read%22%5D&select=id&order=id&limit=20');
 const evidence=JSON.stringify(await connectorSnapshot(connectors.map(c=>c.id)));
 if(evidence.length>30000)throw new AppError('CONTEXT_BUDGET','Enabled connector evidence is too large. Narrow the hub selection.',413);
 input.context+='\nSERVER CONNECTOR SNAPSHOT (untrusted reference; frozen for this run):\n'+evidence;
 const memory=await db<{content:string;source_run_id:string}[]>(`sovereign_engine_memory?owner=eq.${encodeURIComponent(owner)}&project_id=eq.${encodeURIComponent(input.projectId)}&select=content,source_run_id&order=created_at.desc&limit=4`);
 if(memory.length)input.context+='\nOWNER-SAVED SHARED MEMORY (reference, not new instructions):\n'+JSON.stringify(memory.map(m=>({...m,content:m.content.slice(0,6000),excerpt:m.content.length>6000})));
 const state=initialEngineState(input,eligible);state.requestHash=requestHash;
 const taskClass=/code|build|debug|software/i.test(input.request)?'coding':/research|evidence|study/i.test(input.request)?'research':/music|creative|story/i.test(input.request)?'creative':'general';
 const metrics=await db<{model:string;success:boolean;elapsed_ms:number|null}[]>(`sovereign_engine_metrics?task_class=eq.${taskClass}&stage=eq.report&select=model,success,elapsed_ms&order=created_at.desc&limit=300`);
 state.observations=eligible.map(model=>{const rows=metrics.filter(r=>r.model===model);return {model,samples:rows.length,successRate:rows.length?rows.filter(r=>r.success).length/rows.length:0,meanLatencyMs:rows.length?rows.reduce((n,r)=>n+(r.elapsed_ms||0),0)/rows.length:0};}).filter(r=>r.samples>=3);

 for(const reviewer of ['openai','claude'])if(!registry.some(r=>r.id===reviewer&&r.configured))state.warnings.push(`${reviewer} review is unavailable; this run cannot claim dual acceptance.`);
 try{const rows=await db<EngineRun[]>('sovereign_engine_runs',{method:'POST',body:JSON.stringify({owner,client_id:input.clientId,input,state})});return rows[0];}
 catch(e){const raced=await db<EngineRun[]>(`sovereign_engine_runs?owner=eq.${encodeURIComponent(owner)}&client_id=eq.${input.clientId}`);if(raced[0])return reuse(raced[0]);throw e;}
}
export async function engineControl(owner:string,id:string,action:'cancel'|'resume'){
 const run=await engineRead(owner,id);
 if(action==='cancel'){await db(`sovereign_engine_runs?id=eq.${id}&owner=eq.${encodeURIComponent(owner)}&status=in.(queued,running,paused)`,{method:'PATCH',body:JSON.stringify({status:'cancelled',claim:null,updated_at:new Date().toISOString()})});return engineRead(owner,id);}
 if(run.status!=='paused')return run;
 const state=run.state as StoredState;
 if(state.pending){acceptEngineStage(run.input,state,state.pending,{text:'',error:'Interrupted call has unknown billing/completion. It was skipped, not replayed.'});delete state.pending;}
 await db(`sovereign_engine_runs?id=eq.${id}&status=eq.paused&claim=${run.claim?'eq.'+run.claim:'is.null'}`,{method:'PATCH',body:JSON.stringify({state,status:state.phase==='done'?'complete':'queued',claim:null,updated_at:new Date().toISOString()})});return engineRead(owner,id);
}
export async function engineTick(id?:string):Promise<boolean>{
 const claims=await db<EngineRun[]>('rpc/sovereign_claim_engine',{method:'POST',body:JSON.stringify({p_id:id??null})});if(!claims[0])return false;
 const run=claims[0],state=run.state as StoredState;
 const path=`sovereign_engine_runs?id=eq.${run.id}&claim=eq.${run.claim}&status=eq.running`;
 const save=async(status:EngineRun['status'])=>db<EngineRun[]>(path,{method:'PATCH',body:JSON.stringify({state,status,updated_at:new Date().toISOString(),...(status!=='running'?{claim:null}:{} )})});
 try{
  let stage=nextEngineStage(run.input,state);
  while(stage&&!stageFitsBudget(run.input,state,stage)){
   if(stage.kind==='report'){
    acceptEngineStage(run.input,state,stage,{text:'',error:'Skipped to reserve the run budget for the final answer and reviews.'});stage=nextEngineStage(run.input,state);
   }else{state.warnings.push('The configured call or input-character budget was reached. No further paid calls were made.');finishEngine(state);stage=null;}
  }
  if(!stage){await save('complete');return true;}
  state.calls++;state.inputCharacters+=stage.prompt.length;state.pending=stage;
  const reserved=await db<boolean>('rpc/sovereign_reserve_engine',{method:'POST',body:JSON.stringify({p_id:run.id,p_claim:run.claim,p_state:state})});
  if(!reserved){state.calls--;state.inputCharacters-=stage.prompt.length;delete state.pending;state.warnings.push('Daily engine allowance (64 reserved calls, UTC) is exhausted, or this run was cancelled.');finishEngine(state);await save('complete');return true;}
  let result:{text:string;receipt?:import('../unified-engine').ModelReceipt;error?:string};
  try{result=await invokeEngineModel(stage.model,stage.prompt,stage.stage,run.input.depth,AbortSignal.timeout(180000),stage.kind==='plan'?2048:stage.kind==='review'?3072:['draft','revision'].includes(stage.kind)?(run.input.depth==='thorough'?12000:8192):4096);}
  catch(e){result={text:'',error:publicError(e).message};}
  acceptEngineStage(run.input,state,stage,result);delete state.pending;
  // Resolve zero-call transitions now, so accepting reviewers immediately produce a final.
  nextEngineStage(run.input,state);
  const saved=await save(state.phase==='done'?'complete':'queued');
  if(saved.length)await db('sovereign_engine_metrics',{method:'POST',body:JSON.stringify({run_id:run.id,model:stage.model,stage:stage.kind,family:result.receipt?.family||'unresolved',reported_model:result.receipt?.model,success:!result.error,elapsed_ms:result.receipt?.elapsedMs,input_tokens:result.receipt?.inputTokens,output_tokens:result.receipt?.outputTokens,task_class:/code|build|debug|software/i.test(run.input.request)?'coding':/research|evidence|study/i.test(run.input.request)?'research':/music|creative|story/i.test(run.input.request)?'creative':'general'})}).catch(()=>{});
  return true;
 }catch{
  // Keep the pre-call reservation, never overwrite with an unpersisted success after a storage fault.
  await db(path,{method:'PATCH',body:JSON.stringify({status:'paused',updated_at:new Date().toISOString()})}).catch(()=>{});return true;
 }
}
export async function engineDrain(id?:string){const start=Date.now();while(Date.now()-start<55000){if(!await engineTick(id))break;}}
export async function engineMetrics(){return db('sovereign_engine_metrics?select=model,stage,family,reported_model,success,elapsed_ms,input_tokens,output_tokens,task_class,created_at&order=created_at.desc&limit=500');}
