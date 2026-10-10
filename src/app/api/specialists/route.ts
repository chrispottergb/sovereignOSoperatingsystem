import {z} from 'zod';
import {auth,assertSameOrigin,constantEqual,readJsonLimited} from '@/lib/server/auth';
import {db} from '@/lib/server/astra-store';
import {AppError,errorResponse} from '@/lib/server/errors';
import {listSpecialists,queueMusic,specialistJobs,toggleSpecialist} from '@/lib/server/specialists';
import {limiter} from '@/lib/server/limits';
const uuid=z.string().uuid();
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('generate_music'),input:z.unknown()}).strict(),
 z.object({action:z.literal('toggle'),enabled:z.boolean()}).strict(),
 z.object({action:z.literal('cancel'),id:uuid}).strict(),
]);
const workerSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('claim'),ready:z.boolean()}).strict(),
 z.object({action:z.literal('heartbeat'),id:uuid,claim:uuid}).strict(),
 z.object({action:z.literal('fail'),id:uuid,claim:uuid}).strict(),
]);
function authorizeSpecialistWorker(request:Request){if(!process.env.WORKER_SECRET||!constantEqual(request.headers.get('authorization')||'','Bearer '+process.env.WORKER_SECRET))throw new AppError('FORBIDDEN','Runner authorization required.',403);}
export async function GET(request:Request){try{
 await auth.resolve(request);const url=new URL(request.url),id=url.searchParams.get('id')||undefined,turn=url.searchParams.get('turn')||undefined;
 if((id&&!uuid.safeParse(id).success)||(turn&&!uuid.safeParse(turn).success))throw new AppError('VALIDATION','Invalid job or turn ID.',400);
 const state=await listSpecialists();return Response.json({...state,jobs:state.configured?await specialistJobs(id,turn):[]},{headers:{'Cache-Control':'no-store'}});
}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 if(request.headers.has('authorization')){
  authorizeSpecialistWorker(request);const parsed=workerSchema.safeParse(await readJsonLimited(request,4000));if(!parsed.success)throw new AppError('VALIDATION','Invalid worker request.',400);const v=parsed.data;
  if(v.action==='claim'){
   await db('astra_specialist_runner?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:'local',ready:v.ready,last_seen:new Date().toISOString()})});
   return Response.json({jobs:v.ready?await db('rpc/astra_claim_specialist',{method:'POST',body:'{}'}):[]});
  }
  const rows=await db<unknown[]>(`astra_specialist_jobs?id=eq.${v.id}&claim=eq.${v.claim}&status=eq.running&heartbeat_at=gt.${encodeURIComponent(new Date(Date.now()-90000).toISOString())}`,{method:'PATCH',body:JSON.stringify(v.action==='heartbeat'?{heartbeat_at:new Date().toISOString()}:{status:'uncertain',stage:'Generation not confirmed',error:'The worker could not confirm completion. Check ACE-Step before creating another job; no automatic retry.'})});
  if(!rows.length)throw new AppError('LEASE_LOST','This job was cancelled or its lease expired.',409);
  await db('astra_specialist_runner?id=eq.local',{method:'PATCH',body:JSON.stringify({last_seen:new Date().toISOString()})});return Response.json({ok:true});
 }
 assertSameOrigin(request);const owner=await auth.resolve(request);limiter.take('specialist:'+owner.id,20,60000);
 const parsed=schema.safeParse(await readJsonLimited(request,15000));if(!parsed.success)throw new AppError('VALIDATION','Invalid specialist request.',400);const v=parsed.data;
 if(v.action==='generate_music')return Response.json(await queueMusic(v.input));
 if(v.action==='toggle')return Response.json(await toggleSpecialist(v.enabled));
 await db(`astra_specialist_jobs?id=eq.${v.id}&status=in.(queued,running)`,{method:'PATCH',body:JSON.stringify({status:'cancelled',stage:'Cancelled; local generation may still finish'})});return Response.json({ok:true});
}catch(e){return errorResponse(e);}}
