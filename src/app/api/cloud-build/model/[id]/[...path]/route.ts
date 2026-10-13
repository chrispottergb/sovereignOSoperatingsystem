import {createHash} from 'node:crypto';
import {z} from 'zod';
import {db} from '@/lib/server/astra-store';
import {readJsonLimited} from '@/lib/server/auth';
import {modelFor} from '@/lib/server/config';
import {AppError,errorResponse} from '@/lib/server/errors';
export const maxDuration=180;
export async function POST(request:Request,{params}:{params:Promise<{id:string;path:string[]}>}){try{
 const {id,path}=await params;if(!z.string().uuid().safeParse(id).success)throw new AppError('FORBIDDEN','Invalid build access.',403);
 const token=request.headers.get('x-api-key')||request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 if(!/^[a-f0-9]{64}$/.test(token))throw new AppError('FORBIDDEN','Invalid build access.',403);
 const route=path.join('/');if(!['v1/responses','v1/messages','v1/messages/count_tokens'].includes(route))throw new AppError('FORBIDDEN','This model operation is not available to builds.',403);
 const body=await readJsonLimited(request,250000) as Record<string,unknown>;
 if(!body||typeof body!=='object'||Array.isArray(body))throw new AppError('VALIDATION','Expected a model request.',400);
 if(Array.isArray(body.tools)&&body.tools.some(tool=>tool&&typeof tool==='object'&&'type' in tool&&!['function','custom','namespace'].includes(String(tool.type))))throw new AppError('FORBIDDEN','Cloud builds allow local coding tools only.',403);
 const hash=createHash('sha256').update(token).digest('hex');
 const jobs=await db<{input:{builder:string};status:string}[]>(`astra_cloud_builds?id=eq.${id}&token_hash=eq.${hash}&status=eq.running&select=input,status`);
 if(!jobs.length)throw new AppError('LEASE_LOST','Build access expired or was cancelled.',403);
 const provider=jobs[0].input.builder==='codex'?'openai':'claude';
 if((provider==='openai')!==(route==='v1/responses')||body.model!==modelFor(provider))throw new AppError('FORBIDDEN','Build access is limited to the selected coding model.',403);
 const claims=await db<unknown[]>('rpc/astra_charge_build_model',{method:'POST',body:JSON.stringify({p_job:id,p_hash:hash})});
 if(!claims.length)throw new AppError('BUILD_CALL_LIMIT','Build model access expired or reached its 12-request limit.',429);
 const key=process.env[provider==='openai'?'OPENAI_API_KEY':'ANTHROPIC_API_KEY'];if(!key)throw new AppError('ENGINE_UNAVAILABLE','Coding provider is not configured.',409);
 if(route!=='v1/messages/count_tokens'){
  const field=provider==='openai'?'max_output_tokens':'max_tokens';const requested=Number(body[field]);body[field]=Number.isFinite(requested)&&requested>0?Math.min(Math.floor(requested),4096):4096;
  if(provider==='claude'&&body.thinking&&typeof body.thinking==='object'&&'budget_tokens' in body.thinking){if(Number(body[field])<=1024)delete body.thinking;else body.thinking={...body.thinking,budget_tokens:Math.max(1024,Math.min(Number(body.thinking.budget_tokens)||1024,Number(body[field])-1))};}
 }
 if(provider==='openai'){body.store=false;delete body.background;}
 const headers:Record<string,string>={'Content-Type':'application/json'};
 if(provider==='openai')headers.Authorization='Bearer '+key;
 else {headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';const beta=request.headers.get('anthropic-beta');if(beta&&/^[a-zA-Z0-9,._-]{1,1000}$/.test(beta))headers['anthropic-beta']=beta;}
 const upstream=await fetch((provider==='openai'?'https://api.openai.com/':'https://api.anthropic.com/')+route,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.any([request.signal,AbortSignal.timeout(150000)])});
 if(!upstream.ok){await upstream.body?.cancel();throw new AppError('CODING_PROVIDER_ERROR','The coding provider rejected this request. Check model access and remaining credit.',502);}
 return new Response(upstream.body,{headers:{'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'no-store'}});
}catch(e){return errorResponse(e);}}
