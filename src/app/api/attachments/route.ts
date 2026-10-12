import {z} from 'zod';
import {auth,assertSameOrigin,readJsonLimited} from '@/lib/server/auth';
import {createAttachment,attachmentDownload,inspectAttachments,uploadInput} from '@/lib/server/attachments';
import {AppError,errorResponse} from '@/lib/server/errors';
import {limiter} from '@/lib/server/limits';
export const maxDuration=180;
export async function POST(request:Request){try{const owner=await auth.resolve(request);assertSameOrigin(request);limiter.take('attachments:'+owner.id,20,60000);const body=z.discriminatedUnion('action',[z.object({action:z.literal('upload'),input:uploadInput}).strict(),z.object({action:z.literal('inspect'),ids:z.array(z.string().uuid()).min(1).max(4),prompt:z.string().min(1).max(12000)}).strict()]).parse(await readJsonLimited(request,100000));const data=body.action==='upload'?await createAttachment(body.input):await inspectAttachments(body.ids,body.prompt,request.signal);return Response.json(data,{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e instanceof z.ZodError?new AppError('VALIDATION','Check attachment type, count, size and prompt length.',400):e);}}
export async function GET(request:Request){try{await auth.resolve(request);const id=z.string().uuid().parse(new URL(request.url).searchParams.get('id'));const {url}=await attachmentDownload(id);return new Response(null,{status:302,headers:{Location:url,'Cache-Control':'private, no-store'}});}catch(e){return errorResponse(e instanceof z.ZodError?new AppError('VALIDATION','Invalid attachment ID.',400):e);}}
