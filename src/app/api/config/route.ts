import {geminiConfig} from "@/lib/server/gemini";
import {museConfig} from "@/lib/server/muse";
import { providerConfig, demoEnabled } from "@/lib/server/config";
import { deploymentError, isAuthenticated } from "@/lib/server/auth";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return Response.json({ providers: providerConfig(), muse: museConfig(), gemini: geminiConfig(), demoEnabled: demoEnabled(), authRequired: Boolean(process.env.APP_PASSWORD), authenticated: isAuthenticated(request), deploymentError: deploymentError() }, { headers: { "Cache-Control": "no-store" } });
}
