import {z} from 'zod';
import {auth,assertSameOrigin,readJsonLimited} from '@/lib/server/auth';
import {AppError,errorResponse} from '@/lib/server/errors';
import {limiter} from '@/lib/server/limits';
import {planSymbiosis,runGrokbot} from '@/lib/server/symbiosis';
import {symbiosisInput} from '@/lib/symbiosis';
export const maxDuration=180;
const schema=z.discriminatedUnion('action',[z.object({action:z.literal('plan'),input:symbiosisInput}).strict(),z.object({action:z.literal('grokbot'),input:symbiosisInput.extend({brief:z.string().min(1).max(1800)})}).strict()]);
export async function POST(request:Request){try{const owner=await auth.resolve(request);assertSameOrigin(request);limiter.take('symbiosis:'+owner.id,8,60000);const v=schema.parse(await readJsonLimited(request,250000));return Response.json(await (v.action==='plan'?planSymbiosis(v.input,request.signal):runGrokbot(v.input,request.signal)),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e instanceof z.ZodError?new AppError('VALIDATION','Check the orchestration input and context limits.',400):e);}}
