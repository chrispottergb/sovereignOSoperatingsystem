'use client';
import {useRef,useState} from 'react';
import {maxAttachmentTextChars,attachmentAccept,attachmentMime,attachmentBriefSchema,isTextAttachment,type Attachment,type AttachmentBrief} from '@/lib/attachments';
import {importProtocol} from '@/lib/protocol-import';
export function useAttachments(){
 const [files,setFiles]=useState<Attachment[]>([]),[busy,setBusy]=useState(false);
 const cache=useRef<{key:string;result:AttachmentBrief}|undefined>(undefined);
 async function prepare(prompt:string,signal?:AbortSignal){if(!files.length)return;const key=JSON.stringify([files.map(f=>f.id),prompt]);if(cache.current?.key===key)return {...cache.current.result,reused:true};setBusy(true);try{const r=await fetch('/api/attachments',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'inspect',ids:files.map(f=>f.id),prompt})});const d=await r.json();if(!r.ok)throw Error(d.error?.message||'Attachment reading failed.');const result=attachmentBriefSchema.parse(d);cache.current={key,result};return {...result,reused:false};}finally{setBusy(false);}}
 return {files,setFiles,busy,setBusy,prepare,clear:()=>{setFiles([]);cache.current=undefined;}};
}
export function AttachmentTray({files,onChange,disabled,onBusy,compact=false}:{compact?:boolean;files:Attachment[];onChange:(files:Attachment[])=>void;disabled?:boolean;onBusy:(busy:boolean)=>void}){
 const [error,setError]=useState(''),[progress,setProgress]=useState('');const input=useRef<HTMLInputElement>(null),uploading=useRef(false);
 async function add(selected:File[]){if(disabled||uploading.current)return;setError('');if(files.length+selected.length>4){setError('Attach up to four files per prompt.');return;}if([...files,...selected].reduce((n,f)=>n+f.size,0)>60_000_000){setError('Attachments must total 60 MB or less.');return;}
 uploading.current=true;onBusy(true);const next=[...files];try{for(const file of selected){const mime=attachmentMime(file.name);if(!mime)throw Error('Unsupported format. Use PNG, JPG, WebP, PDF, DOCX, TXT, MD, CSV, JSON, MP3, WAV, MP4, MOV or WebM.');if(file.size>25_000_000||file.size===0)throw Error('Each file must be nonempty and no larger than 25 MB.');
 let text:string|undefined;if(isTextAttachment(mime)){if(file.size>2_000_000)throw Error('Text and Word files must be under 2 MB.');text=file.name.toLowerCase().endsWith('.docx')?await importProtocol(file,maxAttachmentTextChars):await file.text();if(!text.trim())throw Error(`${file.name} contains no readable text. For a scanned document, attach the PDF or image instead.`);if(text.length>maxAttachmentTextChars)throw Error(`${file.name} contains ${text.length.toLocaleString()} characters; the limit is 250,000 per file. Split it into smaller documents. No text was truncated.`);}
 setProgress('Uploading '+file.name+'…');const r=await fetch('/api/attachments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'upload',input:{name:file.name,size:file.size,text}})});const d=await r.json();if(!r.ok)throw Error(d.error?.message||'Upload setup failed.');const uploaded=await fetch(d.uploadUrl,{method:'PUT',headers:{'Content-Type':mime,'x-upsert':'false'},body:file,credentials:'omit'});if(!uploaded.ok)throw Error('Private upload failed. Your prompt was not sent.');next.push(d.file);onChange([...next]);}
 }catch(e){setError(e instanceof Error?e.message:'Upload failed.');}finally{setProgress('');uploading.current=false;onBusy(false);if(input.current)input.current.value='';}}
 return <div className={compact?"attachment-tray attachment-tray-compact":"attachment-tray"} onDragOver={e=>{e.preventDefault();}} onDrop={e=>{e.preventDefault();void add(Array.from(e.dataTransfer.files));}}>
 <button type="button" disabled={disabled||files.length>=4} onClick={()=>input.current?.click()}>＋ Attach files</button><input aria-label="Attach prompt files" ref={input} disabled={disabled} type="file" hidden multiple accept={attachmentAccept} onChange={e=>void add(Array.from(e.target.files||[]))}/>
 {!compact&&<span> or drop images, audio, video, PDF, Word or text here</span>}
 {files.length>0&&<ul>{files.map(f=><li key={f.id}><a href={'/api/attachments?id='+f.id} target="_blank" rel="noreferrer">{f.name}</a><small>{(f.size/1_000_000).toFixed(2)} MB</small><button type="button" disabled={disabled} aria-label={'Remove '+f.name} onClick={()=>onChange(files.filter(v=>v.id!==f.id))}>×</button></li>)}</ul>}
 {progress&&<p role="status">{progress}</p>}{error&&<p role="alert">{error}</p>}
 {!compact&&<small>4 files · 25 MB each · 60 MB total. Word/text: 2 MB and 250,000 characters per file; 400,000 characters combined. Files stay in private storage; removing detaches them. Sending reads media or summarizes long text with Meta (+1 paid call; original files remain intact) and shares its source brief. Audio/video use Muse 1.2. Speech can be transcribed; musical/acoustic measurements are not verified. Word imports text only.</small>}
 </div>;
}
