import { auth } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { toolDescriptors } from "@/lib/tools/registry";
export async function GET(request: Request) {
  try { await auth.resolve(request); return Response.json({ tools: toolDescriptors }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); }
}
