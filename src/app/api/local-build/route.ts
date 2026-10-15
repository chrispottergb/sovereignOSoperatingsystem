import {enqueueCloudBuild,listCloudBuilds,cloudBuildConfigured,recoverCloudBuild} from '@/lib/server/cloud-builds';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {auth,assertSameOrigin,constantEqual,readJsonLimited} from '@/lib/server/auth';
import {db} from '@/lib/server/astra-store';
import {AppError,errorResponse} from '@/lib/server/errors';
import {limiter} from '@/lib/server/limits';
import {buildShape} from '@/lib/tools/build-contract';
import {completion} from '@/lib/server/model-completion';
export const maxDuration=300;
const id=z.string().uuid();
const workerSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('claim'),engines:z.object({codex:z.boolean(),'claude-code':z.boolean()})}),
 z.object({action:z.literal('heartbeat'),id,claim:id,stage:z.string().max(80)}),
 z.object({action:z.literal('finish'),id,claim:id,status:z.enum(['completed','failed']),result:z.record(z.unknown())}),
 z.object({action:z.literal('model'),id,claim:id,provider:z.enum(['openai','claude','perplexity','grok']),stage:z.enum(['answer','review','revise','final']),prompt:z.string().min(1).max(290000)}),
]);
export async function GET(request:Request){try{await auth.resolve(request);const [jobs,runners]=await Promise.all([db('astra_local_jobs?select=id,input,status,stage,created_at,heartbeat_at,result&order=created_at.desc&limit=20'),db('astra_local_runner?select=last_seen,engines&id=eq.main')]);return Response.json({jobs:[...(jobs as unknown[]),...await listCloudBuilds() as unknown[]],runners,cloudEnabled:cloudBuildConfigured()},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 const bearer=request.headers.get('authorization');
 if(bearer){if(!process.env.WORKER_SECRET||!constantEqual(bearer,'Bearer '+process.env.WORKER_SECRET))throw new AppError('FORBIDDEN','Invalid runner credentials.',403);
 const v=workerSchema.parse(await readJsonLimited(request,350000));
 if(v.action==='claim'){await db('astra_local_runner?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:'main',last_seen:new Date().toISOString(),engines:v.engines})});return Response.json({jobs:await db('rpc/astra_claim_local_job',{method:'POST',body:'{}'})});}
 const rows=await db<{id:string}[]>(`astra_local_jobs?id=eq.${v.id}&claim=eq.${v.claim}&status=eq.running&select=id`);if(!rows.length)throw new AppError('LEASE_LOST','This job is no longer assigned to the runner.',409);
 if(v.action==='model'){limiter.take('local-build-models',36,60000);if(v.stage==='final'&&!['claude','openai'].includes(v.provider))throw new AppError('VALIDATION','Final evaluation requires Claude or OpenAI.',400);return Response.json(await completion(request.signal)(v.provider,v.prompt,v.stage));}
 if(v.action==='heartbeat'){await db(`astra_local_jobs?id=eq.${v.id}&claim=eq.${v.claim}&status=eq.running`,{method:'PATCH',body:JSON.stringify({stage:v.stage,heartbeat_at:new Date().toISOString()})});await db('astra_local_runner?id=eq.main',{method:'PATCH',body:JSON.stringify({last_seen:new Date().toISOString()})});}
 else await db(`astra_local_jobs?id=eq.${v.id}&claim=eq.${v.claim}&status=eq.running`,{method:'PATCH',body:JSON.stringify({status:v.status,result:v.result,stage:'finished',heartbeat_at:new Date().toISOString()})});return Response.json({ok:true});
 }
 assertSameOrigin(request);const principal=await auth.resolve(request);limiter.take('local-build:'+principal.id,10,60000);
 const body=await readJsonLimited(request,100000);
 const cancel=z.object({action:z.literal('cancel'),id}).strict().safeParse(body);if(cancel.success){if(cloudBuildConfigured())await db(`astra_cloud_builds?id=eq.${cancel.data.id}&status=in.(queued,running)`,{method:'PATCH',body:JSON.stringify({status:'cancelled',stage:'cancelled; active command stops at its time limit',token_hash:null})});await db(`astra_local_jobs?id=eq.${cancel.data.id}&status=in.(queued,running)`,{method:'PATCH',body:JSON.stringify({status:'cancelled',stage:'cancelled by owner'})});return Response.json({ok:true});}
 const retry=z.object({action:z.literal('retry'),id}).strict().safeParse(body);if(retry.success)return Response.json(await recoverCloudBuild(retry.data.id));
 const parsed=z.object({...buildShape,requestId:id}).safeParse(body);if(!parsed.success)throw new AppError('VALIDATION','Check the build request and limits.',400);const {requestId,...input}=parsed.data;
 if(input.environment==='cloud')return Response.json({id:await enqueueCloudBuild(input,requestId)});
 const old=await db<{id:string}[]>(`astra_local_jobs?request_id=eq.${requestId}&select=id`);if(old.length)return Response.json({id:old[0].id});
 const health=await db<{last_seen:string;engines:Record<string,boolean>}[]>('astra_local_runner?id=eq.main');if(!health[0]||Date.now()-Date.parse(health[0].last_seen)>90000)throw new AppError('RUNNER_OFFLINE','Start the local runner on your PC with npm run runner:local. Cloud remains disabled.',409);if(!health[0].engines[input.builder])throw new AppError('ENGINE_UNAVAILABLE','The selected coding CLI is not installed on the runner.',409);
 const job=randomUUID();await db('astra_local_jobs',{method:'POST',body:JSON.stringify({id:job,request_id:requestId,input})});return Response.json({id:job});
}catch(e){return errorResponse(e);}}
