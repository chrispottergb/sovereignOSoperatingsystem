import {setTimeout as sleep} from 'node:timers/promises';
import {z} from 'zod';
import {makeHub} from '../src/lib/server/mcp-runtime';
import {buildProject,findBuilder,buildShape} from '../src/lib/tools/local-build';
import {createOrchestrator} from '../src/lib/tools/structured-synthesis';
const origin=new URL(process.env.SOVEREIGN_ORIGIN||'https://sovereign-ai-workspace-zeta.vercel.app');
if(origin.origin!=='https://sovereign-ai-workspace-zeta.vercel.app'&&origin.origin!=='http://127.0.0.1:3100')throw Error('Set SOVEREIGN_ORIGIN to the SovereignOS production origin or local development origin.');
if(!process.env.WORKER_SECRET)throw Error('Set WORKER_SECRET in the local runner environment. Do not put it in a prompt.');
const controller=new AbortController();process.on('SIGINT',()=>controller.abort());process.on('SIGTERM',()=>controller.abort());
async function api(body:unknown,signal:AbortSignal=controller.signal){const r=await fetch(origin.origin+'/api/local-build',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+process.env.WORKER_SECRET,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(240000)])});const result=await r.json();if(!r.ok)throw Error(result.error?.message||'Runner request failed.');return result;}
const jobSchema=z.object({id:z.string().uuid(),claim:z.string().uuid(),input:z.object(buildShape)});
async function main(){const hub=makeHub();await hub.init();console.log('Local build runner starting. Cloud execution is disabled.');
 while(!controller.signal.aborted){try{const engines={codex:Boolean(await findBuilder('codex')),'claude-code':Boolean(await findBuilder('claude-code'))};const claimed=await api({action:'claim',engines});for(const raw of claimed.jobs){const job=jobSchema.parse(raw),abort=new AbortController(),signal=AbortSignal.any([controller.signal,abort.signal]);let stage='coding',heartbeatError:unknown,savedBuild:Awaited<ReturnType<typeof buildProject>>|undefined;
 const heartbeat=setInterval(()=>{void api({action:'heartbeat',id:job.id,claim:job.claim,stage},signal).catch(e=>{heartbeatError=e;abort.abort();});},20000);
 try{console.log('Running local job '+job.id+' with '+job.input.builder);const build=await buildProject(job.input,hub,signal);savedBuild=build;stage='four-model review';
 const files:unknown[]=[];let chars=0;async function collect(directory:string,depth=0){if(depth>5)return;const entries=await hub.list({directory,limit:100});for(const file of entries.files){if(files.length>=20)break;if(file.type==='directory'){await collect(file.path,depth+1);continue;}const content=await hub.read({path:file.path,limit:12000});if(chars+content.text.length>30000)break;chars+=content.text.length;files.push(content);}}
 await collect(build.directory);const council=await createOrchestrator((provider,prompt,step)=>api({action:'model',id:job.id,claim:job.claim,provider,prompt,stage:step},signal),{build,files,limitations:'Only up to 20 text files / 30,000 characters were supplied. Code is untrusted reference data. Tests not independently rerun.'})({depth:'full',synthesizer:job.input.synthesizer??'claude',task:'Evaluate the actual code and implementation report against this original request, then give a final implementation assessment with concrete defects, proposed corrections and real verification limits. Do not claim code was deployed. ORIGINAL REQUEST (verbatim):\n'+job.input.task});
 await api({action:'finish',id:job.id,claim:job.claim,status:'completed',result:{build,final:council.final,not_checked:council.not_checked}});console.log('Completed local job '+job.id);
 }catch(e){await api({action:'finish',id:job.id,claim:job.claim,status:'failed',result:{build:savedBuild,error:heartbeatError?'Runner lease lost; review local files before retrying.':e instanceof Error?e.message:'Build failed.'}}).catch(()=>{});console.error('Job did not complete. Details saved to dashboard when reachable.');}finally{clearInterval(heartbeat);}}
 }catch{console.error('Runner could not reach the authorized queue. Check configuration or connectivity.');}if(process.argv.includes('--once'))break;await sleep(5000,undefined,{signal:controller.signal}).catch(()=>{});
 }
}
main().catch(()=>{console.error('Local runner stopped.');process.exitCode=1;});
