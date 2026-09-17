import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const database = join(tmpdir(), `pragati-e2e-${randomUUID()}.sqlite3`);

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3001",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "uv run --project backend uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8001",
      url: "http://127.0.0.1:8001/api/health",
      env: {
        JPI_DATABASE: database,
        JPI_FRONTEND_ORIGIN: "http://127.0.0.1:3001",
      },
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: "npm run dev -- --port 3001",
      url: "http://127.0.0.1:3001",
      env: { JPI_API_URL: "http://127.0.0.1:8001", JPI_BUILD_DIR: ".next-e2e" },
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
