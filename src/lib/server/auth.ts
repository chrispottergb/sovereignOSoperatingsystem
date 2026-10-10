import "server-only";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { AppError } from "./errors";
export const COOKIE = "sovereign_session";
export const SESSION_SECONDS = 60 * 60 * 12;
export type Principal = { id: string };
export interface AuthAdapter { resolve(request: Request): Promise<Principal> }
export function deploymentError(): string | undefined {
  if (process.env.VERCEL && process.env.APP_LOCAL_ONLY === "true") return "APP_LOCAL_ONLY must be false on Vercel.";
  if (process.env.APP_PASSWORD && process.env.APP_PASSWORD.length < 16) return "APP_PASSWORD must contain at least 16 characters.";
  if (process.env.NODE_ENV === "production" && process.env.APP_LOCAL_ONLY !== "true" && (!process.env.APP_PASSWORD || !process.env.APP_ORIGIN)) return "Public deployment requires APP_PASSWORD and APP_ORIGIN. For loopback-only operation set APP_LOCAL_ONLY=true.";
  if (process.env.APP_ORIGIN) {
    try {
      const url = new URL(process.env.APP_ORIGIN);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return "APP_ORIGIN must be an exact http(s) origin with no path, credentials, query, or fragment.";
      if (process.env.NODE_ENV === "production" && process.env.APP_LOCAL_ONLY !== "true" && url.protocol !== "https:") return "Public deployment requires an https APP_ORIGIN.";
    } catch { return "APP_ORIGIN must be a valid absolute URL."; }
  }
}
export function constantEqual(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}
export function createSession(now = Date.now()) {
  const payload = String(now + SESSION_SECONDS * 1000);
  const signature = createHmac("sha256", process.env.APP_PASSWORD!).update(`sovereign-v1:${payload}`).digest("hex");
  return `${payload}.${signature}`;
}
export function validSession(token: string, now = Date.now()): boolean {
  if (!process.env.APP_PASSWORD) return false;
  const [expires, sig, extra] = token.split(".");
  if (extra || !sig || !/^\d+$/.test(expires) || Number(expires) <= now || Number(expires) > now + SESSION_SECONDS * 1000) return false;
  const expected = createHmac("sha256", process.env.APP_PASSWORD).update(`sovereign-v1:${expires}`).digest("hex");
  return constantEqual(sig, expected);
}
export function isAuthenticated(request: Request) {
  if (deploymentError()) return false;
  if (!process.env.APP_PASSWORD) return true;
  const cookie = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`));
  return validSession(cookie?.slice(COOKIE.length + 1) ?? "");
}
export const auth: AuthAdapter = { async resolve(request) {
  const error = deploymentError(); if (error) throw new AppError("DEPLOYMENT_CONFIG", error, 503);
  if (!isAuthenticated(request)) throw new AppError("AUTH_REQUIRED", "Unlock your workspace to continue.", 401);
  return { id: "owner" };
} };
export function assertSameOrigin(request: Request) {
  const error = deploymentError();
  if (error) throw new AppError("DEPLOYMENT_CONFIG", error, 503);
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (!origin || origin !== new URL(expected).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("FORBIDDEN", "Request origin is not allowed. Check APP_ORIGIN.", 403);
}
export async function readJsonLimited(request: Request, maxBytes = 350000): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError("BAD_REQUEST", "Expected JSON input.", 415);
  if (Number(request.headers.get("content-length")) > maxBytes) throw new AppError("TOO_LARGE", "Request is too large.", 413);
  const reader = request.body?.getReader(); if (!reader) throw new AppError("BAD_REQUEST", "Missing request body.", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) { await reader.cancel(); throw new AppError("TOO_LARGE", "Request is too large.", 413); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AppError("BAD_REQUEST", "Invalid JSON input.", 400); }
}
