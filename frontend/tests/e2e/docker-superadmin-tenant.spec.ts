import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

function run(cmd: string, cwd: string) {
  execSync(cmd, { cwd, stdio: "inherit" });
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate a free port")));
        return;
      }
      const port = address.port;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

async function waitForHttpOk(url: string, timeoutMs: number) {
  const started = Date.now();
  let lastErr: unknown = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (res.ok) return;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

test.describe("docker e2e: superadmin + tenant isolation", () => {
  test.describe.configure({ mode: "serial" });

  let webPort = Number(process.env.ATT_WEB_PORT || 5173);
  let apiPort = Number(process.env.ATT_API_PORT || 8000);
  let rootUrl = `http://localhost:${webPort}`;
  let apiHealthUrl = `http://localhost:${apiPort}/api/health`;

  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);
  const repoRoot = path.resolve(thisDir, "..", "..", "..");

  test.beforeAll(async () => {
    test.setTimeout(15 * 60_000);

    if (!process.env.ATT_WEB_PORT) {
      webPort = await getFreePort();
      process.env.ATT_WEB_PORT = String(webPort);
    }
    if (!process.env.ATT_API_PORT) {
      apiPort = await getFreePort();
      process.env.ATT_API_PORT = String(apiPort);
    }
    if (!process.env.ATT_DB_PORT) {
      process.env.ATT_DB_PORT = String(await getFreePort());
    }
    if (!process.env.ATT_PMA_PORT) {
      process.env.ATT_PMA_PORT = String(await getFreePort());
    }

    rootUrl = `http://localhost:${webPort}`;
    apiHealthUrl = `http://localhost:${apiPort}/api/health`;

    run("docker compose down -v", repoRoot);
    run("docker compose up -d --build", repoRoot);

    await waitForHttpOk(apiHealthUrl, 180_000);
    await waitForHttpOk(rootUrl, 180_000);
  });

  test.afterAll(() => {
    run("docker compose down -v", repoRoot);
  });

  test("builds docker, creates tenant, logs into tenant subdomain", async ({
    page,
    context,
  }) => {
    test.setTimeout(15 * 60_000);

    const now = Date.now();
    const tenantName = `PW Tenant ${now}`;
    const subdomain = `pw${now}`;
    const tenantEmail = `admin+${now}@tenant.com`;
    const tenantPassword = "secret123";

    await page.goto(`${rootUrl}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Email address").fill("admin@attsys.com");
    await page.getByRole("textbox", { name: "Password" }).fill("secret");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/dashboard", { timeout: 60_000 });

    await expect(
      page.getByRole("button", { name: "Create tenant" })
    ).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Create tenant" }).click();
    const createDialog = page.getByRole("dialog", { name: /create tenant/i });
    await createDialog.getByLabel("Company name").fill(tenantName);
    await createDialog.getByLabel("Subdomain").fill(subdomain);

    const createReq = page.waitForResponse(
      (resp) =>
        resp.request().method() === "POST" &&
        resp.url().includes("/api/tenants"),
      { timeout: 60_000 }
    );
    await createDialog.getByRole("button", { name: /^create$/i }).click();
    const createResp = await createReq;
    const createBody = await createResp.text();
    expect(createResp.status(), createBody).toBe(200);

    await expect(createDialog).toBeHidden({ timeout: 60_000 });
    await expect(page.getByText(`${subdomain}.`)).toBeVisible({
      timeout: 60_000,
    });

    const resetCard = page
      .getByRole("button", { name: /set tenant password/i })
      .locator('xpath=ancestor::*[contains(@class,"MuiCard-root")][1]');
    await resetCard.getByLabel("Subdomain").fill(subdomain);
    await resetCard.getByLabel("Tenant Email").fill(tenantEmail);
    await resetCard.getByLabel("New Password").fill(tenantPassword);

    const resetReq = page.waitForResponse(
      (resp) =>
        resp.request().method() === "POST" &&
        resp.url().includes("/api/tenant_users/reset_password"),
      { timeout: 60_000 }
    );
    await page.getByRole("button", { name: /set tenant password/i }).click();
    const resetResp = await resetReq;
    const resetBody = await resetResp.text();
    expect(resetResp.status(), resetBody).toBe(200);

    const tenantUrl = `http://${subdomain}.localhost:${webPort}`;
    const tenantPage = await context.newPage();

    await tenantPage.goto(`${tenantUrl}/login`, { waitUntil: "networkidle" });
    await expect(tenantPage.getByText(`Tenant: ${subdomain}`)).toBeVisible({
      timeout: 60_000,
    });

    await tenantPage.getByLabel("Email address").fill(tenantEmail);
    await tenantPage
      .getByRole("textbox", { name: "Password" })
      .fill(tenantPassword);
    await tenantPage.getByRole("button", { name: /sign in/i }).click();
    await tenantPage.waitForURL("**/employees", { timeout: 60_000 });

    await tenantPage.reload({ waitUntil: "networkidle" });
    await tenantPage.waitForURL("**/employees", { timeout: 60_000 });

    await expect(tenantPage.getByText(/Employees/i).first()).toBeVisible({
      timeout: 60_000,
    });
  });
});
