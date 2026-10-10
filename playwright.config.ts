import { defineConfig, devices } from "@playwright/test";

// E2E of critical flows per CLAUDE.md tech stack. Automates the M1-M4 exit-test scenarios
// that were manually verified live during each milestone (see CLAUDE_HISTORY.md).
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // each spec drives the same single-document app; keep them serial
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
