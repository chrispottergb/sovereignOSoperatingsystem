import {setTimeout as sleep} from 'node:timers/promises';
import {z} from 'zod';
import {AceStep} from '../src/lib/tools/ace-step';
import {musicInput} from '../src/lib/specialists';
const origin=process.env.SOVEREIGN_ORIGIN||'https://sovereign-ai-workspace-zeta.vercel.app';
if(!['https://sovereign-ai-workspace-zeta.vercel.app','http://127.0.0.1:3100'].includes(origin))throw Error('Unauthorized SovereignOS origin.');
if(!process.env.WORKER_SECRET)throw Error('Pair this local worker with WORKER_SECRET. Existing model API keys are not needed.');
if(!process.env.ACESTEP_ORIGIN)throw Error('Set ACESTEP_ORIGIN to the local ACE-Step API origin, for example http://127.0.0.1:8001.');
const ace=new AceStep(process.env.ACESTEP_ORIGIN,process.env.ACESTEP_API_KEY);
const controller=new AbortController();process.on('SIGINT',()=>controller.abort());process.on('SIGTERM',()=>controller.abort());
async function api(body:unknown,signal=controller.signal){const r=await fetch(origin+'/api/specialists',{method:'POST',headers:{Authorization:'Bearer '+process.env.WORKER_SECRET,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});if(!r.ok)throw Error('Specialist queue request rejected.');return r.json();}
const jobSchema=z.object({id:z.string().uuid(),claim:z.string().uuid(),input:musicInput});
async function main(){
 console.log('Specialist runner: local ACE-Step only. No cloud inference.');
 while(!controller.signal.aborted){try{
  const ready=await ace.ready(controller.signal),batch=await api({action:'claim',ready});
  for(const raw of batch.jobs){
   const job=jobSchema.parse(raw),abort=new AbortController(),signal=AbortSignal.any([controller.signal,abort.signal,AbortSignal.timeout(600000)]);
   let heartbeatBusy=false;
   const heartbeat=setInterval(()=>{if(heartbeatBusy)return;heartbeatBusy=true;void api({action:'heartbeat',id:job.id,claim:job.claim},signal).catch(()=>abort.abort()).finally(()=>{heartbeatBusy=false;});},15000);
   try{
    const audio=await ace.generate(job.input,signal);signal.throwIfAborted();
    const response=await fetch(`${origin}/api/specialists/audio?id=${job.id}&claim=${job.claim}`,{method:'POST',headers:{Authorization:'Bearer '+process.env.WORKER_SECRET,'Content-Type':'audio/mpeg'},body:audio,redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});
    if(!response.ok)throw Error('Artifact upload was not confirmed.');console.log('Music artifact saved for job '+job.id);
   }catch{await api({action:'fail',id:job.id,claim:job.claim}).catch(()=>{});console.error('Job was not confirmed. Check the dashboard and local ACE-Step task before retrying.');}
   finally{clearInterval(heartbeat);}
  }
 }catch{console.error('Specialist queue unavailable; check pairing, migration and local ACE-Step service.');}
 if(process.argv.includes('--once'))break;await sleep(10000,undefined,{signal:controller.signal}).catch(()=>{});
 }
}
main().catch(()=>{console.error('Specialist worker stopped.');process.exitCode=1;});
