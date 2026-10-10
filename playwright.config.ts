import { defineConfig, devices } from "@playwright/test";

// End-to-end tests of the critical flows. Automates the scenarios
// that were manually verified live during each milestone.
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
