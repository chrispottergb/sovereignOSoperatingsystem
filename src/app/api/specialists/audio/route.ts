import {createHash} from 'node:crypto';
import {z} from 'zod';
import {auth,constantEqual} from '@/lib/server/auth';
import {db,storageSettings} from '@/lib/server/astra-store';
import {AppError,errorResponse} from '@/lib/server/errors';
import {maxAudioBytes,type SpecialistJob} from '@/lib/specialists';
export const maxDuration=60;
const uuid=z.string().uuid();
function jobId(request:Request){const id=new URL(request.url).searchParams.get('id');if(!uuid.safeParse(id).success)throw new AppError('VALIDATION','Invalid job ID.',400);return id!;}
export async function GET(request:Request){try{
 await auth.resolve(request);const id=jobId(request);
 const [job]=await db<SpecialistJob[]>(`astra_specialist_jobs?id=eq.${id}&status=eq.completed`);
 if(!job?.artifact_path||!new RegExp(`^${id}/[a-f0-9-]{36}\\.mp3$`).test(job.artifact_path))throw new AppError('NOT_FOUND','Audio is not available.',404);
 const {origin,key}=storageSettings();const r=await fetch(`${origin}/storage/v1/object/authenticated/specialist-assets/${job.artifact_path}`,{headers:{apikey:key,Authorization:`Bearer ${key}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new AppError('STORAGE_ERROR','Audio could not be loaded.',502);
 return new Response(r.body,{headers:{'Content-Type':'audio/mpeg','Content-Disposition':`inline; filename="sovereign-${id}.mp3"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 if(!process.env.WORKER_SECRET||!constantEqual(request.headers.get('authorization')||'','Bearer '+process.env.WORKER_SECRET))throw new AppError('FORBIDDEN','Runner authorization required.',403);
 const id=jobId(request),claim=new URL(request.url).searchParams.get('claim');if(!uuid.safeParse(claim).success)throw new AppError('VALIDATION','Invalid claim.',400);
 const filter=`id=eq.${id}&claim=eq.${claim}&status=eq.running&heartbeat_at=gt.${encodeURIComponent(new Date(Date.now()-90000).toISOString())}`;
 const [job]=await db<SpecialistJob[]>(`astra_specialist_jobs?${filter}`);if(!job)throw new AppError('LEASE_LOST','Job no longer assigned.',409);
 if(request.headers.get('content-type')!=='audio/mpeg'||Number(request.headers.get('content-length'))>maxAudioBytes)throw new AppError('AUDIO_LIMIT','Expected MP3 audio, maximum 3 MB.',413);
 const reader=request.body?.getReader();if(!reader)throw new AppError('VALIDATION','Missing audio.',400);
 const chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxAudioBytes){await reader.cancel();throw new AppError('AUDIO_LIMIT','Audio exceeds 3 MB.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const audio=Buffer.concat(chunks);if(audio.length<4||!(audio.subarray(0,3).toString()==='ID3'||(audio[0]===255&&(audio[1]&224)===224)))throw new AppError('BAD_AUDIO','Expected MP3 file signature.',400);
 const sha=createHash('sha256').update(audio).digest('hex'),artifactPath=`${id}/${claim}.mp3`,{origin,key}=storageSettings();
 const r=await fetch(`${origin}/storage/v1/object/specialist-assets/${artifactPath}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'audio/mpeg','x-upsert':'false'},body:audio,redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw new AppError('STORAGE_ERROR','Audio upload was not confirmed. Do not regenerate automatically.',502);
 const finishFilter=`id=eq.${id}&claim=eq.${claim}&status=eq.running&heartbeat_at=gt.${encodeURIComponent(new Date(Date.now()-90000).toISOString())}`;
 const rows=await db<unknown[]>(`astra_specialist_jobs?${finishFilter}`,{method:'PATCH',body:JSON.stringify({status:'completed',stage:'Audio saved',artifact_path:artifactPath,artifact_sha256:sha,provenance:{adapter:'ace-step-api-v1',model:'acestep-v15-turbo',input_sha256:createHash('sha256').update(JSON.stringify(job.input)).digest('hex'),bytes:audio.length,inference_steps:8,requested_seed:job.input.seed,requested_bpm:job.input.bpm,requested_seconds:job.input.seconds,measurements:'Requested settings only; tempo, duration and neurological effects have not been measured.'}})});
 if(!rows.length)throw new AppError('LEASE_LOST','Job stopped during upload. Private artifact retained but not published as completed.',409);
 return Response.json({ok:true,sha256:sha});
}catch(e){return errorResponse(e);}}
