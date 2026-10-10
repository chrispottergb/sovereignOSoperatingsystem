import {setTimeout as sleep} from 'node:timers/promises';
import {z} from 'zod';
import {musicInput,maxAudioBytes,type MusicInput} from '../specialists';

export function aceOrigin(raw:string){
 const u=new URL(raw);
 if(!['127.0.0.1','[::1]'].includes(u.hostname)||!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('ACE-Step must use an exact loopback origin. Cloud execution is disabled.');
 return u.origin;
}
export function acePayload(input:MusicInput){return {model:'acestep-v15-turbo',prompt:input.prompt,lyrics:input.lyrics||'[Instrumental]',audio_duration:input.seconds,bpm:input.bpm,key_scale:input.keyScale||'',seed:input.seed,use_random_seed:false,batch_size:1,inference_steps:8,audio_format:'mp3',thinking:false,use_format:false,use_cot_caption:false,use_cot_language:false};}
async function boundedBody(r:Response,max:number){const reader=r.body?.getReader();if(!reader)throw Error('Empty ACE-Step response.');const chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('ACE-Step response exceeds the configured size limit.');}chunks.push(value);}}finally{reader.releaseLock();}return Buffer.concat(chunks);}
export class AceStep {
 readonly origin:string;
 constructor(origin:string,private token='',private transport:typeof fetch=fetch,private pause:(ms:number,signal:AbortSignal)=>Promise<unknown>=(ms,signal)=>sleep(ms,undefined,{signal})){this.origin=aceOrigin(origin);}
 private headers(){return this.token?{Authorization:`Bearer ${this.token}`} as Record<string,string>:{};}
 private async json(endpoint:string,signal:AbortSignal,body?:unknown){
  const r=await this.transport(this.origin+endpoint,{method:body?'POST':'GET',headers:{...this.headers(),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
  if(!r.ok)throw Error('ACE-Step rejected the request. Check the local service.');
  const data=JSON.parse((await boundedBody(r,200000)).toString());if(data.code!==200||data.error)throw Error('ACE-Step reported an error.');return data.data;
 }
 async ready(signal:AbortSignal){try{const data=await this.json('/v1/models',signal);return z.object({models:z.array(z.object({name:z.string()}))}).parse(data).models.some(m=>m.name==='acestep-v15-turbo');}catch{return false;}}
 async generate(raw:unknown,signal:AbortSignal){
  const input=musicInput.parse(raw);if(input.environment!=='local')throw Error('Cloud execution is disabled.');signal.throwIfAborted();
  // Never automatically retry this submission: a lost response can still mean a task was created.
  const submitted=z.object({task_id:z.string().min(1).max(200)}).parse(await this.json('/release_task',signal,acePayload(input)));
  for(;;){
   signal.throwIfAborted();const rows=z.array(z.object({task_id:z.string(),status:z.number(),result:z.string().optional()})).parse(await this.json('/query_result',signal,{task_id_list:[submitted.task_id]}));
   const row=rows.find(r=>r.task_id===submitted.task_id);if(!row)throw Error('ACE-Step task was not returned.');
   if(row.status===2)throw Error('ACE-Step generation failed.');
   if(row.status===1){
    const [item]=z.array(z.object({file:z.string()})).min(1).parse(JSON.parse(row.result||'[]'));
    const url=new URL(item.file,this.origin);
    if(url.origin!==this.origin||url.pathname!=='/v1/audio'||url.username||url.password||url.hash)throw Error('ACE-Step returned an unauthorized audio URL.');
    const r=await this.transport(url,{headers:this.headers(),redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
    if(!r.ok)throw Error('Generated audio could not be downloaded.');const audio=await boundedBody(r,maxAudioBytes);
    if(audio.length<4||!(audio.subarray(0,3).toString()==='ID3'||(audio[0]===255&&(audio[1]&224)===224)))throw Error('ACE-Step did not return MP3 audio.');
    return audio;
   }
   if(row.status!==0)throw Error('Unknown ACE-Step task state.');
   await this.pause(3000,signal);
  }
 }
}
