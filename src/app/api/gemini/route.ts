import {z} from 'zod';
import {auth,assertSameOrigin,readJsonLimited} from '@/lib/server/auth';
import {askGemini,geminiInput} from '@/lib/server/gemini';
import {AppError,errorResponse} from '@/lib/server/errors';
import {limiter} from '@/lib/server/limits';
export const maxDuration=120;
export async function POST(request:Request){try{
 const owner=await auth.resolve(request);assertSameOrigin(request);limiter.take('gemini:'+owner.id,6,60000);
 const body=z.discriminatedUnion('action',[z.object({action:z.literal('probe')}).strict(),z.object({action:z.literal('advise'),input:geminiInput}).strict()]).parse(await readJsonLimited(request,150000));
 const result=await askGemini(body.action==='probe'?{prompt:'Reply with exactly CONNECTED.',context:''}:body.input,request.signal,body.action==='probe');
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}catch(e){return errorResponse(e instanceof z.ZodError?new AppError('VALIDATION','Check the prompt length, model and reasoning options.',400):e);}}
