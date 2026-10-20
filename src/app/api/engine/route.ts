import {after} from 'next/server';
import {z} from 'zod';
import {auth,assertSameOrigin,readJsonLimited} from '@/lib/server/auth';
import {AppError,errorResponse} from '@/lib/server/errors';
import {limiter} from '@/lib/server/limits';
import {engineInput} from '@/lib/unified-engine';
import {engineCreate,engineRead,engineList,engineControl,engineDrain,engineMetrics} from '@/lib/server/engine-store';
import {engineRegistry} from '@/lib/server/engine-models';
export const maxDuration=300;
export const dynamic='force-dynamic';
const command=z.discriminatedUnion('action',[z.object({action:z.literal('launch'),input:engineInput}),z.object({action:z.enum(['resume','cancel','advance']),id:z.string().uuid()})]);
export async function GET(request:Request){try{const owner=await auth.resolve(request),url=new URL(request.url),id=url.searchParams.get('id');if(id)return Response.json({run:await engineRead(owner.id,z.string().uuid().parse(id))});if(url.searchParams.has('registry'))return Response.json({registry:engineRegistry(),metrics:await engineMetrics(),notice:'Roles are priors. Runtime metrics are observations, not quality benchmarks. Unpriced routes have no dollar-spending guarantee.'});return Response.json({runs:await engineList(owner.id)});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 assertSameOrigin(request);const owner=await auth.resolve(request);limiter.take('engine:'+owner.id,40,60000);const parsed=command.safeParse(await readJsonLimited(request));if(!parsed.success)throw new AppError('VALIDATION','Invalid shared-engine request.',400);const v=parsed.data;
 const run=v.action==='launch'?await engineCreate(owner.id,v.input):v.action==='advance'?await engineRead(owner.id,v.id):await engineControl(owner.id,v.id,v.action);
 if(run.status==='queued'||run.status==='running')after(()=>engineDrain(run.id));
 return Response.json({run});
 }catch(e){return errorResponse(e);}}
