import { defineConfig, devices } from "@playwright/test";

/**
 * PARADA admin — visual/e2e config. Assumes `npm run dev` (or `next start`)
 * is already running; does not manage the server itself, since the dev
 * server needs a live DB/API connection this config can't provide.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PARADA_ADMIN_URL ?? "http://localhost:3001",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
