import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink,open} from 'node:fs/promises';
import path from 'node:path';
import type {Complete,Completion} from './structured-synthesis';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function read<T>(file:string):Promise<T|undefined>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}}
async function atomic(file:string,value:unknown){const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,file);}
/** Private local MCP checkpoints. Resume is explicit, never an automatic provider retry. */
export class CouncilCheckpoint {
 readonly id:string;readonly directory:string;private locked=false;
 constructor(root:string,id?:string){if(id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw Error('Invalid council run ID.');this.id=id??randomUUID();this.directory=path.join(root,'.council-runs',this.id);}
 async acquire(resume=false):Promise<void>{
  if(resume&&!await read(path.join(this.directory,'request.json')))throw Error('Council checkpoint not found.');
  await mkdir(this.directory,{recursive:true,mode:0o700});
  const lock=path.join(this.directory,'lock.json');
  try{const handle=await open(lock,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid}));await handle.close();this.locked=true;}
  catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;const owner=await read<{pid:number}>(lock);if(!owner||!Number.isInteger(owner.pid))throw Error('Council checkpoint lock needs inspection.');try{process.kill(owner.pid,0);}catch(err){if((err as NodeJS.ErrnoException).code==='ESRCH'){await unlink(lock);return this.acquire(resume);}throw err;}throw Error('This council run is already active.');}
 }
 async release(){if(this.locked){await unlink(path.join(this.directory,'lock.json'));this.locked=false;}}
 async bind(request:unknown){const file=path.join(this.directory,'request.json');const old=await read(file);if(old&&hash(old)!==hash(request))throw Error('Resume requires the original request, settings, and connector selection. Start a new run for changed input.');if(!old)await atomic(file,request);}
 async snapshot<T>(name:string,produce:()=>Promise<T>):Promise<T>{const file=path.join(this.directory,hash(name)+'.json');const old=await read<{value:T}>(file);if(old)return old.value;const value=await produce();await atomic(file,{value});return value;}
 wrap(complete:Complete):Complete{return async(provider,prompt,stage)=>{
  const file=path.join(this.directory,hash({provider,prompt,stage})+'.json');
  const old=await read<{status:string;result?:Completion;attempt?:number}>(file);
  if(old?.status==='complete'&&old.result)return old.result;
  const attempt=(old?.attempt??0)+1;
  const base={provider,stage,prompt,attempt,startedAt:new Date().toISOString()};
  // Each attempt is retained; a started attempt after a crash has unknown billing/completion.
  const attemptFile=path.join(this.directory,hash({provider,prompt,stage})+'-'+attempt+'.json');
  await atomic(file,{...base,status:'started'});await atomic(attemptFile,{...base,status:'started'});
  let result:Completion|undefined;
  try{result=await complete(provider,prompt,stage);
   if(stage==='final'){let parsed:unknown;try{parsed=JSON.parse(result.response);}catch{throw Error('Final evaluator returned invalid JSON; saved raw output requires review or an explicit retry.');}if(!parsed||typeof parsed!=='object'||typeof (parsed as {final?:unknown}).final!=='string'||!Array.isArray((parsed as {not_checked?:unknown}).not_checked)||!(parsed as {not_checked:unknown[]}).not_checked.every(x=>typeof x==='string')||Object.keys(parsed).some(k=>!['final','not_checked'].includes(k)))throw Error('Final evaluator returned invalid final fields.');}
   const saved={...base,status:'complete',result,finishedAt:new Date().toISOString()};await atomic(attemptFile,saved);await atomic(file,saved);return result;
  }catch(e){const err=e as Error&{code?:string;details?:unknown};const saved={...base,status:'failed',result,error:{message:err.message,code:err.code,details:err.details},finishedAt:new Date().toISOString()};await atomic(attemptFile,saved);await atomic(file,saved);throw e;}
 };}
}
