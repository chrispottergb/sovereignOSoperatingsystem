import "server-only";
import { AppError } from "./errors";
export interface RateLimiter { take(key: string, limit: number, windowMs: number): void }
/** Single-process limiter. Replace with an atomic shared store for multiple replicas. */
export class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; reset: number }>();
  constructor(private now = Date.now) {}
  take(key: string, limit: number, windowMs: number) {
    const now = this.now();
    for (const [k, v] of this.buckets) if (v.reset <= now) this.buckets.delete(k);
    const bucket = this.buckets.get(key) ?? { count: 0, reset: now + windowMs };
    if (bucket.count >= limit) throw new AppError("RATE_LIMIT", "Too many requests. Please wait before trying again.", 429, Math.ceil((bucket.reset - now) / 1000));
    bucket.count++; this.buckets.set(key, bucket);
  }
}
const globalState = globalThis as typeof globalThis & { sovereignLimiter?: MemoryRateLimiter; sovereignActive?: number };
export const limiter = globalState.sovereignLimiter ??= new MemoryRateLimiter();
export function acquireStream() {
  if ((globalState.sovereignActive ?? 0) >= 8) throw new AppError("BUSY", "All response slots are busy. Try again shortly.", 429, 5);
  globalState.sovereignActive = (globalState.sovereignActive ?? 0) + 1;
  let released = false;
  return () => { if (!released) { released = true; globalState.sovereignActive = Math.max(0, (globalState.sovereignActive ?? 1) - 1); } };
}
