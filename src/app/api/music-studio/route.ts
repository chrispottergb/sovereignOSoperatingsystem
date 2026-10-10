import {reviewMusicOutput,musicOutputState} from '@/lib/server/music-output';
import {z} from 'zod';
import {auth,assertSameOrigin,readJsonLimited} from '@/lib/server/auth';
import {AppError,errorResponse} from '@/lib/server/errors';
import {limiter} from '@/lib/server/limits';
import {providerConfig} from '@/lib/server/config';
import {listSpecialists,specialistJobs} from '@/lib/server/specialists';
import {musicStudioState,saveMusicConfig,evaluateMusic,challengeMusic,validateMusic,generateValidatedMusic} from '@/lib/server/music-studio';
const id=z.string().uuid();
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),config:z.unknown()}).strict(),
 z.object({action:z.literal('evaluate'),id,brief:z.unknown()}).strict(),
 z.object({action:z.literal('validate'),id}).strict(),
 z.object({action:z.literal('challenge'),id}).strict(),
 z.object({action:z.literal('generate'),id}).strict(),
 z.object({action:z.literal('review_output'),id}).strict(),
]);
export const maxDuration=300;
export async function GET(request:Request){try{await auth.resolve(request);const [state,specialists,outputs]=await Promise.all([musicStudioState(),listSpecialists(),musicOutputState()]);return Response.json({...state,...outputs,providers:providerConfig(),specialists,jobs:specialists.configured?await specialistJobs():[]},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{assertSameOrigin(request);const owner=await auth.resolve(request);limiter.take('music-studio:'+owner.id,12,60000);const parsed=schema.safeParse(await readJsonLimited(request,60000));if(!parsed.success)throw new AppError('VALIDATION','Invalid music studio request.',400);const v=parsed.data;
 if(v.action==='review_output')return Response.json(await reviewMusicOutput(v.id));
 if(v.action==='save')return Response.json(await saveMusicConfig(v.config));
 if(v.action==='evaluate')return Response.json(await evaluateMusic(v.id,v.brief,request.signal));
 if(v.action==='validate')return Response.json(await validateMusic(v.id,request.signal));
 if(v.action==='challenge')return Response.json(await challengeMusic(v.id,request.signal));
 return Response.json(await generateValidatedMusic(v.id));
}catch(e){if(e instanceof z.ZodError)return errorResponse(new AppError('VALIDATION','Check the creative brief and its limits.',400));return errorResponse(e);}}
