import 'server-only';
import {runCloudBuildTick,cloudBuildConfigured,cloudLimits} from './cloud-builds';
import {db} from './astra-store';
import {workRun} from './bot-worker';
import type {RunRow} from '../bots';

export async function cloudStatus(){
 const [settings,health,dispatches]=await Promise.all([
  db<{enabled:boolean;daily_steps:number;enabled_at:string|null}[]>('astra_cloud_settings?id=eq.main'),
  db<{last_seen:string}[]>('astra_worker_health?id=eq.cloud'),
  db<{id:string;run_id:string;status:string;created_at:string}[]>('astra_cloud_dispatches?select=id,run_id,status,created_at&order=created_at.desc&limit=100'),
 ]);
 const lastSeen=health[0]?.last_seen??null;
 return {configured:Boolean(process.env.CLOUD_WORKER_SECRET),enabled:settings[0]?.enabled??false,
  online:Boolean(lastSeen&&Date.now()-Date.parse(lastSeen)<660000),lastSeen,
  dailySteps:settings[0]?.daily_steps??24,stepsReservedToday:dispatches.filter(d=>d.created_at.slice(0,10)===new Date().toISOString().slice(0,10)).length,
  dispatches:dispatches.slice(0,20),cloudBuildsReady:cloudBuildConfigured(),buildLimits:cloudLimits(),
  capabilities:['saved_orchestra_workflows','bot_workflows'],
  limitations:['Main chat still runs in the browser.','Cloud builds create new projects; repository imports and automatic deployment are not enabled.','Step limits are not a dollar spending cap.']};
}
export async function cloudTick(probe=false){
 await db('astra_worker_health?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:'cloud',last_seen:new Date().toISOString()})});
 if(probe)return {ok:true,probe:true,modelCalls:0};
 if(await runCloudBuildTick())return {ok:true,dispatched:true,kind:'cloud_build'};
 const claims=await db<{dispatch_id:string;run_id:string}[]>('rpc/astra_claim_cloud_dispatch',{method:'POST',body:'{}'});
 if(!claims.length)return {ok:true,dispatched:false};
 const claim=claims[0];
 try{
  const runs=await db<(RunRow&{context:unknown})[]>(`astra_runs?id=eq.${claim.run_id}&status=in.(queued,running)`);
  if(runs[0])await workRun(runs[0]);
  await db(`astra_cloud_dispatches?id=eq.${claim.dispatch_id}`,{method:'PATCH',body:JSON.stringify({status:'finished',finished_at:new Date().toISOString()})});
  return {ok:true,dispatched:true,dispatchId:claim.dispatch_id};
 }catch{
  await db(`astra_cloud_dispatches?id=eq.${claim.dispatch_id}`,{method:'PATCH',body:JSON.stringify({status:'uncertain',finished_at:new Date().toISOString()})}).catch(()=>{});
  throw Error('Cloud step interrupted; durable state retained.');
 }
}
