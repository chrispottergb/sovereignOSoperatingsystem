import {askMuse,museConfig} from './muse';
import {readFile} from 'node:fs/promises';
import {listSpecialists,specialistJobs} from './specialists';
import {specialistHelp} from '../specialists';
import path from 'node:path';
import {z} from 'zod';
import {contextSchema,providerIds,type SharedContext} from '../contracts';
import {SharedHub,readToolNames,toolHelp,redactKnownSecrets} from '../tools/shared-hub';
import {withSharedTools} from '../tools/model-tools';
import {createOrchestrator,type Complete} from '../tools/structured-synthesis';
import {completion} from './model-completion';
export {completion} from './model-completion';
import {modelFor,keyNames} from './config';
import {db,storageReady} from './astra-store';
import {connectorSnapshot} from './connector-hub';
import {findBuilder} from '../tools/local-build';
export async function getMcpContext():Promise<SharedContext>{if(!process.env.MCP_CONTEXT_FILE)return {projectName:'SovereignOS',notes:''};const data=await readFile(process.env.MCP_CONTEXT_FILE,'utf8');if(data.length>50000)throw Error('Shared context file is too large.');return contextSchema.parse(JSON.parse(redactKnownSecrets(data)));}
export function makeHub(){return new SharedHub(path.resolve(process.env.MCP_WORKSPACE_DIR||'mcp-workspace'),getMcpContext);}
export async function gateway(body:unknown,signal?:AbortSignal){
 const origin=process.env.SOVEREIGN_ORIGIN;
 if(!origin||!process.env.WORKER_SECRET)throw Error('MCP gateway is not paired. Configure SOVEREIGN_ORIGIN and WORKER_SECRET locally.');
 if(!['https://sovereign-ai-workspace-zeta.vercel.app','http://127.0.0.1:3100'].includes(origin))throw Error('MCP gateway origin is not authorized.');
 const response=await fetch(origin+'/api/mcp-model',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+process.env.WORKER_SECRET,'Content-Type':'application/json'},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(240000)]):AbortSignal.timeout(20000)});
 const result=await response.json();if(!response.ok)throw Error(result.error?.message||'MCP gateway request failed.');return result;
}
export function gatewayConfigured(){return Boolean(process.env.SOVEREIGN_ORIGIN&&process.env.WORKER_SECRET);}
export async function capabilities(){const remote=gatewayConfigured()?await gateway({action:'capabilities'}):undefined;return {gateway:remote?'connected':'local credentials',models:providerIds.map(id=>({provider:id,model:modelFor(id),credential_present:remote?Boolean(remote.providers.find((p:{id:string})=>p.id===id)?.configured):Boolean(process.env[keyNames[id]]),verified:false})),shared_tools:[...readToolNames,'sovereign_save_note','sovereign_save_artifact','sovereign_list_connectors','sovereign_read_connectors'],storage:storageReady()?'configured':'not_configured',build:{local:{codex:{installed:Boolean(await findBuilder('codex')),authentication_verified:false},'claude-code':{installed:Boolean(await findBuilder('claude-code')),authentication_verified:false}},cloud:{enabled:false,reason:'Disabled by owner'}},muse:museConfig(),limitations:['API key presence does not verify account credit or model access.','MCP shared files are text/code files, not PDF/audio parsers.','External publishing requires the existing approval flow.']};}
export async function listConnectors(){if(gatewayConfigured())return gateway({action:'list_connectors'});if(!storageReady())return {configured:false,connectors:[]};return {configured:true,connectors:await db('astra_connectors?select=id,provider,label,enabled,permissions&order=created_at.desc')};}
export async function readConnectors(ids:unknown){const parsed=z.array(z.string().uuid()).max(20).parse(ids);if(gatewayConfigured())return gateway({action:'read_connectors',ids:parsed});if(!storageReady())throw Error('Supabase credentials are not configured for this MCP process.');return connectorSnapshot(parsed);}
export async function runSharedCouncil(request:unknown,hub:SharedHub,signal:AbortSignal,connectorIds:string[]=[],complete:Complete=gatewayConfigured()?((provider,prompt,stage)=>gateway({action:"model",provider,prompt,stage},signal)):completion(signal),useMuse=false){
 await hub.init();const [context,memory,files,connectors]=await Promise.all([hub.context(),hub.memory(),hub.list({limit:30}),connectorIds.length?readConnectors(connectorIds):Promise.resolve({selected:[]})]);
 const muse=useMuse?(gatewayConfigured()?await gateway({action:"muse_advise",input:{prompt:JSON.stringify(request),context:JSON.stringify({context,memory,files,connectors})}},signal):await askMuse({prompt:JSON.stringify(request),context:JSON.stringify({context,memory,files,connectors})},signal)):undefined;
 const shared={context,memory,files,connectors,...(muse?{muse}:{})};if(JSON.stringify(shared).length>30000)throw Error('Shared context exceeds 30,000 characters. Select fewer sources or shorten project notes.');
 const cache=new Map<string,Promise<unknown>>();const catalog={...Object.fromEntries(readToolNames.map(n=>[n,toolHelp[n]])),list_specialists:specialistHelp.list_specialists,read_specialist_job:specialistHelp.read_specialist_job};
 const execute=(name:string,args:unknown)=>{const key=JSON.stringify([name,args]);if(!cache.has(key))cache.set(key,name==='list_specialists'?(gatewayConfigured()?gateway({action:'list_specialists'}):listSpecialists()):name==='read_specialist_job'?(()=>{const {id}=z.object({id:z.string().uuid()}).strict().parse(args);return gatewayConfigured()?gateway({action:'read_specialist_job',id}):specialistJobs(id).then(jobs=>({jobs}));})():hub.execute(name,args));return cache.get(key)!;};
 return createOrchestrator(withSharedTools(complete,execute,catalog),shared)(request);
}
