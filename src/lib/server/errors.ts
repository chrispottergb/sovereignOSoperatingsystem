import "server-only";
export class AppError extends Error {
  details?:unknown;
  constructor(public code: string, message: string, public status = 500, public retryAfter?: number) { super(message); }
}
export function publicError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && error.name === "TimeoutError") return new AppError("TIMEOUT", "The provider took too long. Retry this response.", 504);
  if (error instanceof Error && error.name === "AbortError") return new AppError("CANCELLED", "Response cancelled.", 499);
  const diagnostic=error as {name?:unknown;code?:unknown;cause?:{code?:unknown}}|null;
  const safe=(value:unknown)=>typeof value==='string'&&/^[a-zA-Z0-9_]{1,80}$/.test(value)?value:undefined;
  console.error('provider_operation_failed',{name:safe(diagnostic?.name),code:safe(diagnostic?.code),causeCode:safe(diagnostic?.cause?.code)});
  return new AppError("CONNECTION_ERROR", "The connection was interrupted. Your other responses are unaffected. Please retry.", 502);
}
export function errorResponse(error: unknown) {
  const e = publicError(error);
  return Response.json({ error: { code: e.code, message: e.message, retryAfter: e.retryAfter, details:e.details } }, { status: e.status, headers: { "Cache-Control": "no-store", ...(e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {}) } });
}
