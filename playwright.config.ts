import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, timeout: 45000,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [ { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "msedge" } }, { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", channel: "msedge" } } ],
  webServer: { command: "npm run dev -- --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: false, timeout: 120000, env: { APP_ORIGIN: "http://127.0.0.1:3100", APP_PASSWORD: "", ENABLE_DEMO: "true", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", PERPLEXITY_API_KEY: "", XAI_API_KEY: "" } },
});
