import {z} from 'zod';
import {auth,assertSameOrigin,readJsonLimited} from '@/lib/server/auth';
import {beginGmail,gmailStatus,GMAIL_COOKIE,sendAyaGmail} from '@/lib/server/aya-gmail';
import {errorResponse} from '@/lib/server/errors';
export async function GET(request:Request){try{await auth.resolve(request);return Response.json(await gmailStatus(),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{assertSameOrigin(request);await auth.resolve(request);const body=z.object({action:z.enum(['connect','test'])}).strict().parse(await readJsonLimited(request,1024));if(body.action==='test')return Response.json(await sendAyaGmail({task_name:'Test ping',action:'Confirm receipt only, no execution',destination:'Aya',content:'Bridge test from ChatGPT — please confirm receipt in this thread',timing:'now',approval:'draft only'}),{headers:{'Cache-Control':'no-store'}});const {url,cookie}=beginGmail();return Response.json({url},{headers:{'Cache-Control':'no-store','Set-Cookie':GMAIL_COOKIE+'='+cookie+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600'}});}catch(e){return errorResponse(e);}}
