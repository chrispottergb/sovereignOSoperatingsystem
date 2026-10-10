import "server-only";
export class AppError extends Error {
  constructor(public code: string, message: string, public status = 500, public retryAfter?: number) { super(message); }
}
export function publicError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && error.name === "TimeoutError") return new AppError("TIMEOUT", "The provider took too long. Retry this response.", 504);
  if (error instanceof Error && error.name === "AbortError") return new AppError("CANCELLED", "Response cancelled.", 499);
  return new AppError("CONNECTION_ERROR", "The connection was interrupted. Your other responses are unaffected. Please retry.", 502);
}
export function errorResponse(error: unknown) {
  const e = publicError(error);
  return Response.json({ error: { code: e.code, message: e.message, retryAfter: e.retryAfter } }, { status: e.status, headers: { "Cache-Control": "no-store", ...(e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {}) } });
}
