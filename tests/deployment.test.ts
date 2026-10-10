import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertSameOrigin, deploymentError, isAuthenticated } from "@/lib/server/auth";

describe("public deployment safeguards", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("APP_LOCAL_ONLY", "false");
    vi.stubEnv("APP_PASSWORD", "test-only-password-over-16-characters");
    vi.stubEnv("APP_ORIGIN", "https://workspace.example.com");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("requires an authenticated session for a configured deployment", () => {
    expect(deploymentError()).toBeUndefined();
    expect(isAuthenticated(new Request("https://workspace.example.com"))).toBe(false);
  });
  it("cannot use the loopback bypass on Vercel", () => {
    vi.stubEnv("APP_LOCAL_ONLY", "true");
    vi.stubEnv("APP_PASSWORD", "");
    expect(deploymentError()).toContain("must be false on Vercel");
    expect(isAuthenticated(new Request("https://workspace.example.com"))).toBe(false);
  });
  it.each(["APP_PASSWORD", "APP_ORIGIN"])("fails closed when %s is missing", (name) => {
    vi.stubEnv(name, "");
    expect(deploymentError()).toContain("requires APP_PASSWORD and APP_ORIGIN");
  });
  it.each(["not a URL", "http://workspace.example.com", "https://workspace.example.com/path", "https://user:pass@workspace.example.com", "https://workspace.example.com?x=1", "https://workspace.example.com#x"])("rejects invalid public origin %s with a configuration error", (origin) => {
    vi.stubEnv("APP_ORIGIN", origin);
    expect(deploymentError()).toBeTruthy();
    expect(() => assertSameOrigin(new Request("https://workspace.example.com", { headers: { origin } }))).toThrow(/APP_ORIGIN/);
  });
  it("rejects another preview or alias and accepts the configured domain", () => {
    expect(() => assertSameOrigin(new Request("https://workspace.example.com", { headers: { origin: "https://other.example.com" } }))).toThrow("Request origin is not allowed");
    expect(() => assertSameOrigin(new Request("https://workspace.example.com", { headers: { origin: "https://workspace.example.com" } }))).not.toThrow();
  });
});
