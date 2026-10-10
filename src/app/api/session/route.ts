import { z } from "zod";
import { assertSameOrigin, constantEqual, COOKIE, createSession, deploymentError, readJsonLimited, SESSION_SECONDS } from "@/lib/server/auth";
import { AppError, errorResponse } from "@/lib/server/errors";
import { limiter } from "@/lib/server/limits";
function cookie(value: string, maxAge: number) { return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.APP_ORIGIN?.startsWith("https://") ? "; Secure" : ""}`; }
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); limiter.take("login", 10, 60000);
    const configError = deploymentError(); if (configError) throw new AppError("DEPLOYMENT_CONFIG", configError, 503);
    const parsed = z.object({ password: z.string().max(1024) }).safeParse(await readJsonLimited(request, 2048));
    if (!parsed.success || !process.env.APP_PASSWORD || !constantEqual(parsed.data.password, process.env.APP_PASSWORD)) throw new AppError("AUTH_FAILED", "That workspace password is incorrect.", 401);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie(createSession(), SESSION_SECONDS), "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request) {
  try { assertSameOrigin(request); return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie("", 0) } }); } catch (error) { return errorResponse(error); }
}
