import 'server-only';
import {z} from 'zod';
import {db,storageReady} from './astra-store';
import {AppError} from './errors';
import {musicInput,specialistRegistry,type SpecialistJob} from '../specialists';

const publicFields='id,request_id,input,status,stage,created_at,artifact_sha256,error,provenance';
export async function listSpecialists(){
 const base={models:specialistRegistry,cloudEnabled:false,limits:{secondsPerJob:120,secondsPerDay:600,queuedAndRunning:3,automaticRetries:0},enabled:false,runnerOnline:false,configured:false};
 if(!storageReady())return {...base,setup:'Supabase is not configured.'};
 try {
  const [settings,runners]=await Promise.all([db<{enabled:boolean}[]>('astra_specialist_settings?id=eq.music'),db<{ready:boolean;last_seen:string}[]>('astra_specialist_runner?id=eq.local')]);
  return {...base,configured:true,enabled:Boolean(settings[0]?.enabled),runnerOnline:Boolean(runners[0]?.ready&&Date.now()-Date.parse(runners[0].last_seen)<90000),setup:null};
 }catch{return {...base,setup:'Specialist storage is unavailable. Apply the specialist migration and check Supabase connectivity.'};}
}
export async function queueMusic(raw:unknown){
 const parsed=musicInput.safeParse(raw);if(!parsed.success)throw new AppError('VALIDATION','Check music prompt, duration, tempo and seed.',400);
 const input=parsed.data;if(input.environment!=='local')throw new AppError('CLOUD_DISABLED','Cloud execution remains disabled.',409);
 const old=await db<SpecialistJob[]>(`astra_specialist_jobs?request_id=eq.${input.requestId}&select=id,input`);
 if(old[0]){if(JSON.stringify(old[0].input)!==JSON.stringify(input)&&Object.entries(input).some(([k,v])=>old[0].input[k as keyof typeof input]!==v))throw new AppError('REQUEST_CONFLICT','This request ID belongs to different settings.',409);return {id:old[0].id};}
 const state=await listSpecialists();
 if(!state.configured||!state.enabled||!state.runnerOnline)throw new AppError('SPECIALIST_UNAVAILABLE',state.setup||'Enable music for the council and start the local specialist worker.',409);
 try{return {id:await db<string>('rpc/astra_queue_music',{method:'POST',body:JSON.stringify({p_input:input})})};}
 catch{throw new AppError('QUEUE_LIMIT','Queue response was not confirmed. Retry with the same request ID. Check the worker, connector, three-job queue limit and 600-second rolling daily budget.',409);}
}
export async function specialistJobs(id?:string,sourceTurnId?:string){
 if(id)z.string().uuid().parse(id);if(sourceTurnId)z.string().uuid().parse(sourceTurnId);
 return db<SpecialistJob[]>(`astra_specialist_jobs?select=${publicFields}&order=created_at.desc&limit=20${id?`&id=eq.${id}`:''}${sourceTurnId?`&input->>sourceTurnId=eq.${sourceTurnId}`:''}`);
}
export async function toggleSpecialist(enabled:boolean){
 await db('astra_specialist_settings?id=eq.music',{method:'PATCH',body:JSON.stringify({enabled})});
 return {enabled,models:['openai','claude','perplexity','grok'],note:'Disabling prevents new claims; cancel an active job separately.'};
}
