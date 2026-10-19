import {planSymbiosis,runGrokbot} from './symbiosis';
import type {SymbiosisPlan} from '../symbiosis';
import {CouncilCheckpoint} from '../tools/council-checkpoint';
import {geminiConfig} from './gemini';
import {museConfig} from './muse';
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
 const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error?.message||'MCP gateway request failed.'),{code:result.error?.code,details:result.error?.details});return result;
}
export function gatewayConfigured(){return Boolean(process.env.SOVEREIGN_ORIGIN&&process.env.WORKER_SECRET);}
export async function capabilities(){const remote=gatewayConfigured()?await gateway({action:'capabilities'}):undefined;return {gateway:remote?'connected':'local credentials',models:providerIds.map(id=>({provider:id,model:remote?.providers.find((p:{id:string})=>p.id===id)?.model??modelFor(id),credential_present:remote?Boolean(remote.providers.find((p:{id:string})=>p.id===id)?.configured):Boolean(id==="muse"?process.env.MUSE_API_KEY||process.env.MODEL_API_KEY:process.env[keyNames[id]]),verified:false})),shared_tools:[...readToolNames,'sovereign_save_note','sovereign_save_artifact','sovereign_list_connectors','sovereign_read_connectors'],storage:remote?.storage??(storageReady()?'configured':'not_configured'),build:{local:{codex:{installed:Boolean(await findBuilder('codex')),authentication_verified:false},'claude-code':{installed:Boolean(await findBuilder('claude-code')),authentication_verified:false}},cloud:{enabled:false,reason:'Disabled by owner'}},muse:remote?.muse??museConfig(),gemini:remote?.gemini??geminiConfig(),limitations:['API key presence does not verify account credit or model access.','MCP shared files are text/code files, not PDF/audio parsers.','External publishing requires the existing approval flow.']};}
export async function listConnectors(){if(gatewayConfigured())return gateway({action:'list_connectors'});if(!storageReady())return {configured:false,connectors:[]};return {configured:true,connectors:await db('astra_connectors?select=id,provider,label,enabled,permissions&order=created_at.desc')};}
export async function readConnectors(ids:unknown){const parsed=z.array(z.string().uuid()).max(20).parse(ids);if(gatewayConfigured())return gateway({action:'read_connectors',ids:parsed});if(!storageReady())throw Error('Supabase credentials are not configured for this MCP process.');return connectorSnapshot(parsed);}
export async function runSharedCouncil(request:unknown,hub:SharedHub,signal:AbortSignal,connectorIds:string[]=[],complete:Complete|undefined=undefined,useMuse=false,runId?:string,spendingMode:'economy'|'thorough'='economy',autoSpecialists=false,useGemini=false){
 const checkpoint=new CouncilCheckpoint(hub.root,runId);await checkpoint.acquire(Boolean(runId));
 try{await checkpoint.bind({councilVersion:2,request,connectorIds,useMuse,spendingMode,...(useGemini?{useGemini:true}:{}),...(autoSpecialists?{autoSpecialists:true}:{})});
 await hub.init();const [context,memory,files,connectors]=await checkpoint.snapshot('context',()=>Promise.all([hub.context(),hub.memory(),hub.list({limit:30}),connectorIds.length?readConnectors(connectorIds):Promise.resolve({selected:[]})]));
 const orchestration=autoSpecialists?await checkpoint.snapshot('orchestration',async()=>{const input={prompt:JSON.stringify(request),context:JSON.stringify({context,memory,files,connectors}),forceMuse:useMuse};return gatewayConfigured()?gateway({action:'symbiosis_plan',input},signal):planSymbiosis(input,signal);}):undefined;
 const plan:SymbiosisPlan|undefined=orchestration?.plan;
 const muse=undefined,gemini=undefined;
 const grokbot=plan?.grokbot.needed?await checkpoint.snapshot('grokbot',async()=>{const input={prompt:JSON.stringify(request),brief:plan.grokbot.prompt,context:JSON.stringify({context,memory,files,connectors,muse})};return gatewayConfigured()?gateway({action:'grokbot',input},signal):runGrokbot(input,signal);}):undefined;
 const shared:{gemini?:unknown;orchestration?:unknown;grokbot?:unknown;context:unknown;memory:unknown;files:unknown;connectors:unknown;muse?:unknown;toolEvidence?:{name:string;arguments:unknown;result:unknown}[]}={context,memory,files,connectors,...(gemini?{gemini}:{}),...(muse?{muse}:{}),...(orchestration?{orchestration}:{}),...(grokbot?{grokbot}:{})};if(JSON.stringify(shared).length>30000)throw Error('Shared context exceeds 30,000 characters. Select fewer sources or shorten project notes.');
 const cache=new Map<string,Promise<unknown>>();const catalog={...Object.fromEntries(readToolNames.map(n=>[n,toolHelp[n]])),list_specialists:specialistHelp.list_specialists,read_specialist_job:specialistHelp.read_specialist_job};
 const execute=(name:string,args:unknown)=>{const key=JSON.stringify([name,args]);if(!cache.has(key))cache.set(key,checkpoint.snapshot('tool:'+key,()=>name==='list_specialists'?(gatewayConfigured()?gateway({action:'list_specialists'}):listSpecialists()):name==='read_specialist_job'?(()=>{const {id}=z.object({id:z.string().uuid()}).strict().parse(args);return gatewayConfigured()?gateway({action:'read_specialist_job',id}):specialistJobs(id).then(jobs=>({jobs}));})():hub.execute(name,args)).then(result=>{const evidence=[...(shared.toolEvidence??[]),{name,arguments:args,result}];if(JSON.stringify({...shared,toolEvidence:evidence}).length>30000)throw Error('Shared tool evidence exceeds 30,000 characters. Start a new run with smaller sources.');shared.toolEvidence=evidence;return result;}));return cache.get(key)!;};
 const policyComplete:Complete=complete??(gatewayConfigured()?((provider,prompt,stage)=>gateway({action:'model',provider,prompt,stage,spendingMode},signal)):completion(signal,spendingMode));
 const value=await createOrchestrator(withSharedTools(checkpoint.wrap(policyComplete),execute,catalog),shared,plan?.assignments)(request);
 return {...value,run_id:checkpoint.id};
 }catch(e){throw Object.assign(Error(`${e instanceof Error?e.message:'Council failed.'} Saved run: ${checkpoint.id}. Resume with run_id and the original inputs; only unfinished calls will be retried and may incur charges.`),{cause:e});}finally{await checkpoint.release();}
}
