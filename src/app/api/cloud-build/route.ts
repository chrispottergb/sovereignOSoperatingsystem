import {z} from 'zod';
import {auth} from '@/lib/server/auth';
import {db,readArtifact} from '@/lib/server/astra-store';
import {AppError,errorResponse} from '@/lib/server/errors';
export async function GET(request:Request){try{
 await auth.resolve(request);const id=new URL(request.url).searchParams.get('id');if(!z.string().uuid().safeParse(id).success)throw new AppError('VALIDATION','Invalid build id.',400);
 const jobs=await db<{artifact_path:string|null}[]>(`astra_cloud_builds?id=eq.${id}&select=artifact_path`);
 if(!jobs[0]?.artifact_path)throw new AppError('NOT_FOUND','This build has no saved files yet.',404);
 return Response.json(await readArtifact(jobs[0].artifact_path),{headers:{'Cache-Control':'no-store','Content-Disposition':`attachment; filename="sovereign-build-${id}.json"`}});
}catch(e){return errorResponse(e);}}
