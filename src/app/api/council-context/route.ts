import {listSpecialists,specialistJobs} from '@/lib/server/specialists';
import {auth} from '@/lib/server/auth';
import {db,storageReady} from '@/lib/server/astra-store';
import {connectorSnapshot} from '@/lib/server/connector-hub';
import {errorResponse,AppError} from '@/lib/server/errors';
import {limiter} from '@/lib/server/limits';

// Freeze one evidence snapshot per turn, so every model evaluates the same data.
export async function GET(request:Request){try{
 const owner=await auth.resolve(request);limiter.take('council-context:'+owner.id,20,60000);
 if(!storageReady())return Response.json({evidence:JSON.stringify({status:'Connector storage is not configured.'})});
 const connectors=await db<{id:string}[]>('astra_connectors?enabled=eq.true&permissions=cs.%5B%22read%22%5D&select=id&order=id&limit=21');
 if(connectors.length>20)throw new AppError('CONTEXT_BUDGET','More than 20 connectors are enabled. Select the needed connections in the hub.',413);
 const specialists=await listSpecialists();
 const artifacts=specialists.configured?(await specialistJobs()).filter(j=>j.status==='completed').slice(0,5).map(j=>({id:j.id,operation:'generate_music',sha256:j.artifact_sha256,settings:{seconds:j.input.seconds,bpm:j.input.bpm,seed:j.input.seed},sourceTurnId:j.input.sourceTurnId})):[];
 const evidence=JSON.stringify({connectors:await connectorSnapshot(connectors.map(c=>c.id)),specialists:{...specialists,artifacts,instruction:'Music generation can be launched through the shared specialist panel after your answer. Other adapters are planned, not executable. These artifact records are metadata only: you have not listened to audio or measured neurological effects. Do not claim execution unless a completed job is recorded.'}});
 if(evidence.length>30000)throw new AppError('CONTEXT_BUDGET','Connected evidence exceeds this turn’s context budget. Narrow the enabled snapshots in the hub.',413);
 return Response.json({evidence},{headers:{'Cache-Control':'no-store'}});
}catch(e){return errorResponse(e);}}
