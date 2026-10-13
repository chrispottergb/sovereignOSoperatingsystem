import {z} from 'zod';
import {auth,assertSameOrigin,constantEqual,readJsonLimited} from '@/lib/server/auth';
import {db} from '@/lib/server/astra-store';
import {cloudStatus,cloudTick} from '@/lib/server/cloud-worker';
import {AppError,errorResponse} from '@/lib/server/errors';
export const maxDuration=300;
export async function GET(request:Request){try{await auth.resolve(request);return Response.json(await cloudStatus(),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 const bearer=request.headers.get('authorization');
 if(bearer){
  const secret=process.env.CLOUD_WORKER_SECRET;
  if(!secret||!constantEqual(bearer,'Bearer '+secret))throw new AppError('FORBIDDEN','Invalid cloud worker credential.',403);
  const parsed=z.object({action:z.enum(['tick','probe'])}).strict().safeParse(await readJsonLimited(request,1024));
  if(!parsed.success)throw new AppError('VALIDATION','Unknown cloud action.',400);const input=parsed.data;
  return Response.json(await cloudTick(input.action==='probe'));
 }
 assertSameOrigin(request);await auth.resolve(request);
 const input=z.object({enabled:z.boolean()}).strict().parse(await readJsonLimited(request,1024));
 if(input.enabled&&!process.env.CLOUD_WORKER_SECRET)throw new AppError('NOT_CONFIGURED','Cloud dispatcher is not configured.',409);
 const settings=await db<{enabled_at:string|null}[]>('astra_cloud_settings?id=eq.main');
 await db('astra_cloud_settings?id=eq.main',{method:'PATCH',body:JSON.stringify({enabled:input.enabled,enabled_at:settings[0]?.enabled_at??new Date().toISOString()})});
 return Response.json({ok:true});
}catch(e){return errorResponse(e);}}
