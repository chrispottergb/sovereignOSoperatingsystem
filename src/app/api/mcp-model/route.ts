import {askMuse,museConfig,museInput} from '@/lib/server/muse';
import {listSpecialists,queueMusic,specialistJobs,toggleSpecialist} from '@/lib/server/specialists';
import {z} from 'zod';
import {constantEqual,readJsonLimited} from '@/lib/server/auth';
import {AppError,errorResponse} from '@/lib/server/errors';
import {limiter} from '@/lib/server/limits';
import {completion} from '@/lib/server/model-completion';
import {connectorSnapshot} from '@/lib/server/connector-hub';
import {providerConfig} from '@/lib/server/config';
import {db,readArtifact} from '@/lib/server/astra-store';
const uuid=z.string().uuid();
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('muse_probe')}),z.object({action:z.literal('muse_advise'),input:museInput}),
 z.object({action:z.literal('model'),provider:z.enum(['openai','claude','perplexity','grok']),stage:z.enum(['answer','review','revise','final']),prompt:z.string().min(1).max(290000)}),
 z.object({action:z.literal('list_specialists')}),z.object({action:z.literal('generate_music'),input:z.unknown()}),z.object({action:z.literal('read_specialist_job'),id:uuid}),z.object({action:z.literal('toggle_specialist'),enabled:z.boolean()}),
 z.object({action:z.literal('capabilities')}),z.object({action:z.literal('list_connectors')}),
 z.object({action:z.literal('read_connectors'),ids:z.array(uuid).max(20)}),
 z.object({action:z.literal('toggle_connector'),id:uuid,enabled:z.boolean()}),
 z.object({action:z.literal('list_runs')}),z.object({action:z.literal('read_run'),id:uuid}),
]);
export const maxDuration=300;
export async function POST(request:Request){try{
 if(!process.env.WORKER_SECRET||!constantEqual(request.headers.get('authorization')||'','Bearer '+process.env.WORKER_SECRET))throw new AppError('FORBIDDEN','MCP gateway authorization required.',403);
 limiter.take('mcp-gateway',60,60000);const parsed=schema.safeParse(await readJsonLimited(request,350000));if(!parsed.success)throw new AppError('VALIDATION','Invalid MCP gateway request.',400);const v=parsed.data;
 if(v.action==='muse_probe')return Response.json(await askMuse({prompt:'Reply with exactly CONNECTED.'},request.signal,true));
 if(v.action==='muse_advise')return Response.json(await askMuse(v.input,request.signal));
 if(v.action==='model'){if(v.stage==='final'&&!['claude','openai'].includes(v.provider))throw new AppError('VALIDATION','Final evaluator must be Claude or OpenAI.',400);return Response.json(await completion(request.signal)(v.provider,v.prompt,v.stage));}
 if(v.action==='list_specialists')return Response.json(await listSpecialists());
 if(v.action==='generate_music')return Response.json(await queueMusic(v.input));
 if(v.action==='read_specialist_job')return Response.json({jobs:await specialistJobs(v.id)});
 if(v.action==='toggle_specialist')return Response.json(await toggleSpecialist(v.enabled));
 if(v.action==='capabilities')return Response.json({providers:providerConfig(),muse:museConfig(),cloudEnabled:false});
 if(v.action==='list_connectors')return Response.json({configured:true,connectors:await db('astra_connectors?select=id,provider,label,enabled,permissions&order=created_at.desc')});
 if(v.action==='read_connectors')return Response.json(await connectorSnapshot(v.ids));
 if(v.action==='toggle_connector'){const rows=await db<unknown[]>(`astra_connectors?id=eq.${v.id}`,{method:'PATCH',body:JSON.stringify({enabled:v.enabled,models:['openai','claude','perplexity','grok']})});if(!rows.length)throw new AppError('NOT_FOUND','Connector not found.',404);return Response.json({id:v.id,enabled:v.enabled,models:['openai','claude','perplexity','grok']});}
 if(v.action==='list_runs')return Response.json({runs:await db('astra_runs?select=id,prompt,status,created_at,calls_started,reported_tokens&order=created_at.desc&limit=30')});
 const steps=await db<{id:string;status:string;output_path:string|null}[]>(`astra_steps?run_id=eq.${v.id}&select=id,status,output_path&order=ordinal`);const final=steps.find(s=>s.id==='final');return Response.json({id:v.id,steps:steps.map(({id,status})=>({id,status})),answer:final?.output_path?await readArtifact(final.output_path):null});
}catch(e){return errorResponse(e);}}
