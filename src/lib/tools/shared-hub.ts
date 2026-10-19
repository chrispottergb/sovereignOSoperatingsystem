import {readdir,readFile,realpath,lstat,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {contextSchema,type SharedContext} from '../contracts';
export const hubShapes={
 sovereign_list_files:{directory:z.string().default(''),offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(100).default(40)},
 sovereign_read_file:{path:z.string().min(1),offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(20000).default(12000)},
 sovereign_read_memory:{},
 sovereign_save_note:{title:z.string().min(1).max(120),text:z.string().min(1).max(12000)},
 sovereign_save_artifact:{name:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/),text:z.string().max(50000)},
};
export type HubTool=keyof typeof hubShapes;
const allowed=new Set(['.md','.txt','.csv','.json','.ts','.tsx','.js','.jsx','.py','.html','.css','.sql','.yaml','.yml']);
function permitted(file:string){return allowed.has(path.extname(file).toLowerCase())&&!/(^|[\/_.-])(secret|credentials?|tokens?|passwords?|auth|private[-_]?key)([\/_.-]|$)/i.test(file)&&!path.basename(file).startsWith('.');}
export function redactKnownSecrets(text:string){for(const name of ['GEMINI_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','PERPLEXITY_API_KEY','XAI_API_KEY','SUPABASE_SERVICE_ROLE_KEY','WORKER_SECRET','APP_PASSWORD','CONNECTOR_ENCRYPTION_KEY']){const secret=process.env[name];if(secret&&secret.length>=8)text=text.split(secret).join('[REDACTED]');}return text;}
export class SharedHub {
 constructor(readonly root:string,readonly context:()=>Promise<SharedContext>){ }
 async init(){await mkdir(this.root,{recursive:true});}
 async resolve(relative:string,directory=false){
  if(path.isAbsolute(relative)||relative.includes(':')||relative.includes('\\')||relative.split('/').some(p=>p==='..'||p.startsWith('.')))throw Error('Use a relative shared-workspace path without hidden segments.');
  const base=await realpath(this.root),candidate=path.resolve(base,relative),rel=path.relative(base,candidate);
  if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Path is outside the shared workspace.');
  let current=base;for(const part of rel.split(path.sep).filter(Boolean)){current=path.join(current,part);if((await lstat(current)).isSymbolicLink())throw Error('Linked files and directories are not shared.');}
  const actual=await realpath(candidate);if(actual!==base&&!actual.startsWith(base+path.sep))throw Error('Path is outside the shared workspace.');
  if(!directory&&!permitted(relative))throw Error('This file type or credential-related filename is not shareable.');
  return actual;
 }
 async list(args:unknown){const v=z.object(hubShapes.sovereign_list_files).strict().parse(args),dir=await this.resolve(v.directory,true);const entries=(await readdir(dir,{withFileTypes:true})).filter(e=>!e.isSymbolicLink()&&!e.name.startsWith('.')&&((e.isDirectory()&&!['node_modules','builds'].includes(e.name))||(e.isFile()&&permitted(e.name)))).sort((a,b)=>a.name.localeCompare(b.name));return {files:entries.slice(v.offset,v.offset+v.limit).map(e=>({path:[v.directory,e.name].filter(Boolean).join('/'),type:e.isDirectory()?'directory':'file'})),total:entries.length,next_offset:v.offset+v.limit<entries.length?v.offset+v.limit:null};}
 async read(args:unknown){const v=z.object(hubShapes.sovereign_read_file).strict().parse(args),file=await this.resolve(v.path);const stat=await lstat(file);if(!stat.isFile()||stat.size>500000)throw Error('Read only text files up to 500 KB.');const text=redactKnownSecrets(await readFile(file,'utf8')); if(text.includes('\0'))throw Error('Binary files cannot be read as text.');return {path:v.path,text:text.slice(v.offset,v.offset+v.limit),total_characters:text.length,next_offset:v.offset+v.limit<text.length?v.offset+v.limit:null};}
 async memory(){try{const dir=await this.resolve('memory',true),entries=(await readdir(dir)).filter(n=>n.endsWith('.json')).sort().slice(-20);const notes=[];for(const name of entries){const content=await this.read({path:'memory/'+name,limit:20000});notes.push(JSON.parse(content.text));}return {notes,limit:20};}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {notes:[],limit:20};throw e;}}
 async save(kind:'memory'|'artifacts',args:unknown){const v=kind==='memory'?z.object(hubShapes.sovereign_save_note).strict().parse(args):z.object(hubShapes.sovereign_save_artifact).strict().parse(args);await this.init();const dir=path.join(await realpath(this.root),kind);await mkdir(dir,{recursive:true});await this.resolve(kind,true);const name=Date.now()+'-'+randomUUID()+(kind==='memory'?'.json':'-'+('name' in v?v.name:'output.txt'));if(!permitted(name))throw Error('Use a supported text file extension and non-sensitive filename.');const file=path.join(dir,name);const text=kind==='memory'?JSON.stringify({...v,created_at:new Date().toISOString()}):v.text;await writeFile(file,text,{flag:'wx',mode:0o600});return {path:kind+'/'+name,bytes:Buffer.byteLength(text)};}
 async execute(name:string,args:unknown){switch(name){case 'read_project_context':return contextSchema.parse(await this.context());case 'sovereign_list_files':return this.list(args);case 'sovereign_read_file':return this.read(args);case 'sovereign_read_memory':z.object({}).strict().parse(args);return this.memory();case 'sovereign_save_note':return this.save('memory',args);case 'sovereign_save_artifact':return this.save('artifacts',args);default:throw Error('Tool unavailable.');}}
}
export const readToolNames=['read_project_context','sovereign_list_files','sovereign_read_file','sovereign_read_memory'] as const;
export const toolHelp={read_project_context:'Read shared project name and reference notes. Arguments: {}.',sovereign_list_files:'List shared text/code files. Arguments: {directory?: relative directory, offset?:number, limit?:number}.',sovereign_read_file:'Read a shared text/code file. Arguments: {path:relative path,offset?:number,limit?:number}.',sovereign_read_memory:'Read the latest 20 owner-saved project notes. Arguments: {}.',sovereign_save_note:'Save an explicit project decision or note as a new version; never overwrite previous notes.',sovereign_save_artifact:'Save a text/code deliverable as a new file; never execute or overwrite it.'};
