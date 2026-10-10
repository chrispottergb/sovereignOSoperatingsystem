import {auth} from '@/lib/server/auth';
import {db,storageReady} from '@/lib/server/astra-store';
import {connectorSnapshot} from '@/lib/server/connector-hub';
import {errorResponse,AppError} from '@/lib/server/errors';
import {limiter} from '@/lib/server/limits';

// Freeze one evidence snapshot per turn, so every model evaluates the same data.
export async function GET(request:Request){try{
 const owner=await auth.resolve(request);limiter.take('council-context:'+owner.id,20,60000);
 if(!storageReady())return Response.json({evidence:JSON.stringify({status:'Connector storage is not configured.'})});
 const connectors=await db<{id:string}[]>('astra_connectors?enabled=eq.true&permissions=cs.%7Bread%7D&select=id&order=id&limit=21');
 if(connectors.length>20)throw new AppError('CONTEXT_BUDGET','More than 20 connectors are enabled. Select the needed connections in the hub.',413);
 const evidence=JSON.stringify(await connectorSnapshot(connectors.map(c=>c.id)));
 if(evidence.length>30000)throw new AppError('CONTEXT_BUDGET','Connected evidence exceeds this turn’s context budget. Narrow the enabled snapshots in the hub.',413);
 return Response.json({evidence},{headers:{'Cache-Control':'no-store'}});
}catch(e){return errorResponse(e);}}
