import { generateSchema, type StreamEvent } from "@/lib/contracts";
import { assertSameOrigin, auth, readJsonLimited } from "@/lib/server/auth";
import { AppError, errorResponse, publicError } from "@/lib/server/errors";
import { boundedEnv, demoEnabled, keyNames } from "@/lib/server/config";
import { acquireStream, limiter } from "@/lib/server/limits";
import { adapters, demoAdapter } from "@/lib/server/providers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const principal = await auth.resolve(request);
    limiter.take(`generate:${principal.id}`, 36, 60000);
    const parsed = generateSchema.safeParse(await readJsonLimited(request));
    if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message || "Invalid request.", 400);
    const input = parsed.data;
    if (input.mode === "demo" && !demoEnabled()) throw new AppError("DEMO_DISABLED", "Demo mode is disabled on this server.", 403);
    if (input.mode === "live" && !process.env[keyNames[input.provider]]?.trim()) throw new AppError("MISSING_KEY", `Add ${keyNames[input.provider]} to the server environment variables, then restart or redeploy the app.`, 503);
    const release = acquireStream();
    const abort = new AbortController();
    const signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(boundedEnv("REQUEST_TIMEOUT_MS", 180000, 5000, 280000))]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const emit = (e: StreamEvent) => { if (!closed && !abort.signal.aborted) { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { closed = true; abort.abort(); } } };
        const heartbeat = setInterval(() => { if (!closed && !signal.aborted) { try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { abort.abort(); } } }, 15000);
        try {
          const adapter = input.mode === "demo" ? demoAdapter : adapters[input.provider];
          for await (const event of adapter.stream(input, signal)) emit(event);
        } catch (error) {
          const e = publicError(signal.aborted ? signal.reason : error);
          emit({ type: "error", message: e.message, code: e.code, retryAfter: e.retryAfter });
        } finally { clearInterval(heartbeat); release(); if (!closed) { closed = true; try { controller.close(); } catch { /* Client disconnected. */ } } }
      },
      cancel() { abort.abort(); release(); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "Connection": "keep-alive" } });
  } catch (error) { return errorResponse(error); }
}
