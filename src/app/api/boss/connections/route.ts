import {auth,assertSameOrigin,readJsonLimited} from "@/lib/server/auth";
import {errorResponse} from "@/lib/server/errors";
import {connections,recordConnection} from "@/lib/server/boss-registry";
export async function GET(request:Request){try{const owner=await auth.resolve(request);return Response.json({connections:await connections(owner.id)});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{const owner=await auth.resolve(request);assertSameOrigin(request);return Response.json(await recordConnection(owner.id,await readJsonLimited(request,10000)));}catch(e){return errorResponse(e);}}
