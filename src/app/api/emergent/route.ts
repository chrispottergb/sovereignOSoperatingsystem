import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {auth,assertSameOrigin,readJsonLimited} from '@/lib/server/auth';
import {storeArtifact,readArtifact} from '@/lib/server/astra-store';
import {emergentBriefSchema,emergentPacket} from '@/lib/emergent';
import {AppError,errorResponse} from '@/lib/server/errors';
export async function GET(request:Request){try{
 await auth.resolve(request);const id=z.string().uuid().parse(new URL(request.url).searchParams.get('id'));
 return Response.json(await readArtifact(`emergent/${id}.json`),{headers:{'Cache-Control':'no-store'}});
}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 assertSameOrigin(request);await auth.resolve(request);
 const parsed=emergentBriefSchema.safeParse(await readJsonLimited(request,400000));
 if(!parsed.success)throw new AppError('VALIDATION','Check the request and brief length.',400);
 const id=randomUUID(),record={id,input:parsed.data,packet:emergentPacket(parsed.data),status:'prepared',createdAt:new Date().toISOString(),submitted:false};
 await storeArtifact(`emergent/${id}.json`,JSON.stringify(record));
 return Response.json(record,{headers:{'Cache-Control':'no-store'}});
}catch(e){return errorResponse(e);}}
