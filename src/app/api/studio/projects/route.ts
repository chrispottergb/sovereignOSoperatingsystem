import { auth, assertSameOrigin, readJsonLimited } from "@/lib/server/auth";
import { db, storageReady } from "@/lib/server/astra-store";
import { projectInput } from "@/lib/astra";
import { AppError, errorResponse } from "@/lib/server/errors";
export async function GET(request:Request) {
  try {
    await auth.resolve(request);
    if(!storageReady()) return Response.json({ configured:false,projects:[] },{headers:{"Cache-Control":"no-store"}});
    return Response.json({configured:true,projects:await db("astra_projects?select=*&order=created_at.desc")},{headers:{"Cache-Control":"no-store"}});
  } catch(error) { return errorResponse(error); }
}
export async function POST(request:Request) {
  try {
    assertSameOrigin(request); await auth.resolve(request);
    const parsed=projectInput.safeParse(await readJsonLimited(request,25000));
    if(!parsed.success) throw new AppError("BAD_REQUEST","Check the project name and brief length.",400);
    const projects=await db<unknown[]>("astra_projects",{method:"POST",body:JSON.stringify(parsed.data)});
    return Response.json({project:projects[0]},{status:201,headers:{"Cache-Control":"no-store"}});
  } catch(error) { return errorResponse(error); }
}
