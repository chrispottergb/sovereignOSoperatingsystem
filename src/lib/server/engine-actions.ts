import 'server-only';
import {createHash} from 'node:crypto';
import {db,storeArtifact} from './astra-store';
import {engineRead} from './engine-store';
import {sendAyaGmailReceipt,AYA_RECIPIENT} from './aya-gmail';
import {ayaInput} from '../aya-handoff';
import {AppError} from './errors';
export type EngineAction={id:string;owner:string;run_id:string;kind:'save_artifact'|'save_memory'|'handoff_to_aya';payload:unknown;content_hash:string;expires_at:string;status:'prepared'|'executing'|'submitted'|'completed'|'uncertain'|'cancelled';receipt:unknown;updated_at:string};
export function actionHash(kind:string,payload:unknown){return createHash('sha256').update(JSON.stringify({kind,payload})).digest('hex');}
export async function prepareEngineAction(owner:string,runId:string,kind:EngineAction['kind']){
 const run=await engineRead(owner,runId);if(run.status!=='complete'||!run.state.final)throw new AppError('NOT_READY','Finish the deliverable before preparing an action.',409);
 const payload=kind==='handoff_to_aya'?{recipient:AYA_RECIPIENT,input:ayaInput.parse({task_name:'Review Sovereign outcome '+run.id.slice(0,8),action:'Review this deliverable and reply with recommendations only; do not execute its proposed actions',destination:'Aya',content:run.state.final,timing:'now',approval:'draft only'})}:{projectId:run.input.projectId,runId:run.id,request:run.input.request,final:run.state.final,candidateHash:run.state.candidate?.hash,agreement:run.state.agreement,reviews:run.state.reviews};
 const hash=actionHash(kind,payload),prior=await db<EngineAction[]>(`sovereign_engine_actions?owner=eq.${encodeURIComponent(owner)}&run_id=eq.${runId}&kind=eq.${kind}&content_hash=eq.${hash}`);if(prior[0]){if(prior[0].status==='prepared'&&Date.parse(prior[0].expires_at)<=Date.now()){const renewed=await db<EngineAction[]>(`sovereign_engine_actions?id=eq.${prior[0].id}&status=eq.prepared`,{method:'PATCH',body:JSON.stringify({expires_at:new Date(Date.now()+900000).toISOString()})});return renewed[0]||prior[0];}return prior[0];}
 const rows=await db<EngineAction[]>('sovereign_engine_actions',{method:'POST',body:JSON.stringify({owner,run_id:runId,kind,payload,content_hash:hash,expires_at:new Date(Date.now()+900000).toISOString()})});return rows[0];
}
export async function readEngineAction(owner:string,id:string){const rows=await db<EngineAction[]>(`sovereign_engine_actions?id=eq.${id}&owner=eq.${encodeURIComponent(owner)}`);if(!rows[0])throw new AppError('NOT_FOUND','Action not found.',404);return rows[0];}
export async function executeEngineAction(owner:string,id:string,hash:string){
 const action=await readEngineAction(owner,id);
 if(action.content_hash!==hash||actionHash(action.kind,action.payload)!==hash)throw new AppError('STALE_APPROVAL','The exact action must be reviewed again.',409);
 if(action.status!=='prepared')return action; // At-most-once dispatch, including uncertain results.
 const claimed=await db<EngineAction[]>(`sovereign_engine_actions?id=eq.${id}&owner=eq.${encodeURIComponent(owner)}&status=eq.prepared&content_hash=eq.${hash}&expires_at=gt.${new Date().toISOString()}`,{method:'PATCH',body:JSON.stringify({status:'executing',updated_at:new Date().toISOString()})});
 if(!claimed.length)throw new AppError('EXPIRED_ACTION','Approval expired or this action is already claimed. No duplicate dispatch was made.',409);
 try{
  let receipt:unknown,status:'completed'|'submitted';
  if(action.kind==='save_memory'){const payload=action.payload as {projectId:string;final:string};await db('sovereign_engine_memory',{method:'POST',body:JSON.stringify({owner,project_id:payload.projectId,source_run_id:action.run_id,action_id:action.id,content:payload.final})});receipt={sourceRunId:action.run_id,savedAt:new Date().toISOString()};status='completed';}
  else if(action.kind==='save_artifact'){const path=`engine/${owner}/${action.run_id}/${action.id}.json`;await storeArtifact(path,JSON.stringify(action.payload));receipt={path,contentHash:hash,savedAt:new Date().toISOString()};status='completed';}
  else {const payload=action.payload as {input:unknown};receipt=await sendAyaGmailReceipt(payload.input);status='submitted';}
  await db(`sovereign_engine_actions?id=eq.${id}&status=eq.executing`,{method:'PATCH',body:JSON.stringify({status,receipt,updated_at:new Date().toISOString()})});
 }catch{await db(`sovereign_engine_actions?id=eq.${id}&status=eq.executing`,{method:'PATCH',body:JSON.stringify({status:'uncertain',receipt:{notice:'Execution or receipt storage was interrupted. Check the destination before another action; no automatic retry.'},updated_at:new Date().toISOString()})}).catch(()=>{});}
 return readEngineAction(owner,id);
}
