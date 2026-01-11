import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "https://khudroo.com",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command:
        "C:\\tools\\php\\php.exe -S 0.0.0.0:8000 -t ..\\backend\\public ..\\backend\\public\\index.php",
      url: "http://khudroo.com:8000/api/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --host 0.0.0.0 --port 5173",
      url: "http://khudroo.com:5173",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
