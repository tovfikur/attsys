import { defineConfig, devices } from "@playwright/test";

const webPort = Number(process.env.ATT_WEB_PORT || 5173);
const apiPort = Number(process.env.ATT_API_PORT || 5170);
const useDocker = String(process.env.PLAYWRIGHT_USE_DOCKER || "") === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ||
      (useDocker ? `http://localhost:${webPort}` : "https://khudroo.com"),
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: useDocker
    ? []
    : [
        {
          command: `C:\\tools\\php\\php.exe -S 0.0.0.0:${apiPort} -t ..\\backend\\public ..\\backend\\public\\index.php`,
          url: `http://khudroo.com:${apiPort}/api/health`,
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
