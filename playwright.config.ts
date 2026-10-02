import { defineConfig } from "@playwright/test";

const port = 4173;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: "npm run build && npm start",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(port),
      DATA_FILE: ":memory:",
      OWNER_EMAIL: "owner@example.com",
      OWNER_PASSWORD: "correct-horse",
    },
  },
});
