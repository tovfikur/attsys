import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

function run(cmd: string, cwd: string, opts?: { allowFailure?: boolean }) {
  try {
    execSync(cmd, { cwd, stdio: "inherit" });
  } catch (e) {
    if (opts?.allowFailure) return;
    throw e;
  }
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
  let apiPort = Number(process.env.ATT_API_PORT || 5170);
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

    run("docker compose down -v", repoRoot, { allowFailure: true });
    run("docker compose up -d --build", repoRoot);

    await waitForHttpOk(apiHealthUrl, 180_000);
    await waitForHttpOk(rootUrl, 180_000);
  });

  test.afterAll(() => {
    run("docker compose down -v", repoRoot, { allowFailure: true });
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

    await page.goto(`${rootUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Email address").fill("admin@attsys.com");
    await page.getByRole("textbox", { name: "Password" }).fill("secret");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/dashboard", { timeout: 60_000 });

    await page.getByRole("tab", { name: "Create Tenant" }).click();
    await page.getByRole("textbox", { name: "Company name" }).fill(tenantName);
    await page.getByRole("textbox", { name: "Subdomain" }).fill(subdomain);
    await page.getByRole("textbox", { name: "Tenant Email" }).fill(tenantEmail);
    await page
      .getByRole("textbox", { name: "Tenant Password" })
      .fill(tenantPassword);

    const createReq = page.waitForResponse(
      (resp) =>
        resp.request().method() === "POST" &&
        resp.url().includes("/api/tenants"),
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: /^create tenant$/i }).click();
    const createResp = await createReq;
    const createBody = await createResp.text();
    expect(createResp.status(), createBody).toBe(200);

    await expect(
      page.getByText(new RegExp(`${subdomain}\\.localhost`, "i")),
    ).toBeVisible({
      timeout: 60_000,
    });

    await page.getByRole("tab", { name: "Set Password" }).click();
    await page.getByRole("textbox", { name: "Subdomain" }).fill(subdomain);
    await page.getByRole("textbox", { name: "Tenant Email" }).fill(tenantEmail);
    await page
      .getByRole("textbox", { name: "New Password" })
      .fill(tenantPassword);

    const resetReq = page.waitForResponse(
      (resp) =>
        resp.request().method() === "POST" &&
        resp.url().includes("/api/tenant_users/reset_password"),
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: /set tenant password/i }).click();
    const resetResp = await resetReq;
    const resetBody = await resetResp.text();
    expect(resetResp.status(), resetBody).toBe(200);

    const tenantUrl = `http://${subdomain}.localhost:${webPort}`;
    const tenantPage = await context.newPage();

    await tenantPage.goto(`${tenantUrl}/login`, {
      waitUntil: "domcontentloaded",
    });
    await expect(tenantPage.getByText(`Tenant: ${subdomain}`)).toBeVisible({
      timeout: 60_000,
    });

    await tenantPage.getByLabel("Email address").fill(tenantEmail);
    await tenantPage
      .getByRole("textbox", { name: "Password" })
      .fill(tenantPassword);
    await tenantPage.getByRole("button", { name: /sign in/i }).click();
    await tenantPage.waitForURL("**/employees", { timeout: 60_000 });

    await tenantPage.reload({ waitUntil: "load" });
    await tenantPage.waitForURL("**/employees", { timeout: 60_000 });

    await expect(tenantPage.getByText(/Employees/i).first()).toBeVisible({
      timeout: 60_000,
    });

    const tenantToken = await tenantPage.evaluate(
      () => localStorage.getItem("token") || sessionStorage.getItem("token"),
    );
    expect(tenantToken).toBeTruthy();

    const apiBase = `http://127.0.0.1:${apiPort}`;

    const empResp = await context.request.post(`${apiBase}/api/employees`, {
      headers: {
        Authorization: `Bearer ${tenantToken}`,
        "Content-Type": "application/json",
        "X-Tenant-ID": subdomain,
      },
      data: {
        name: "Geo Test Employee",
        code: `GEO${now}`,
        gender: "Male",
        date_of_birth: "1990-01-01",
        personal_phone: "0123456789",
        email: `geo+${now}@tenant.com`,
        present_address: "Dhaka",
        permanent_address: "Dhaka",
        department: "IT",
        designation: "Engineer",
        employee_type: "Full-time",
        date_of_joining: "2024-01-01",
        supervisor_name: "Boss",
        work_location: "HQ",
      },
      timeout: 60_000,
    });
    const empBody = await empResp.text();
    expect(empResp.status(), empBody).toBe(200);
    const empJson = JSON.parse(empBody) as { employee?: { id?: string } };
    const employeeId = String(empJson.employee?.id || "");
    expect(employeeId).toBeTruthy();

    const geoSettingsResp = await context.request.post(
      `${apiBase}/api/geo/settings`,
      {
        headers: {
          Authorization: `Bearer ${tenantToken}`,
          "Content-Type": "application/json",
          "X-Tenant-ID": subdomain,
        },
        data: {
          enabled: 1,
          require_fence: 1,
          update_interval_sec: 30,
          offline_after_sec: 180,
          min_accuracy_m: null,
        },
        timeout: 60_000,
      },
    );
    const geoSettingsBody = await geoSettingsResp.text();
    expect(geoSettingsResp.status(), geoSettingsBody).toBe(200);

    const fenceResp = await context.request.post(`${apiBase}/api/geo/fences`, {
      headers: {
        Authorization: `Bearer ${tenantToken}`,
        "Content-Type": "application/json",
        "X-Tenant-ID": subdomain,
      },
      data: {
        name: "Default Fence",
        type: "circle",
        active: 1,
        is_default: 1,
        center_lat: 0,
        center_lng: 0,
        radius_m: 200,
      },
      timeout: 60_000,
    });
    const fenceBody = await fenceResp.text();
    expect(fenceResp.status(), fenceBody).toBe(200);

    const outsideResp = await context.request.post(
      `${apiBase}/api/attendance/clockin`,
      {
        headers: {
          Authorization: `Bearer ${tenantToken}`,
          "Content-Type": "application/json",
          "X-Tenant-ID": subdomain,
        },
        data: {
          employee_id: employeeId,
          latitude: 20,
          longitude: 20,
        },
        timeout: 60_000,
      },
    );
    const outsideBody = await outsideResp.text();
    expect(outsideResp.status()).toBe(400);
    expect(outsideBody).toContain("You are outside the authorized work area");

    const insideResp = await context.request.post(
      `${apiBase}/api/attendance/clockin`,
      {
        headers: {
          Authorization: `Bearer ${tenantToken}`,
          "Content-Type": "application/json",
          "X-Tenant-ID": subdomain,
        },
        data: {
          employee_id: employeeId,
          latitude: 0,
          longitude: 0,
        },
        timeout: 60_000,
      },
    );
    const insideBody = await insideResp.text();
    expect(insideResp.status()).toBe(400);
    expect(insideBody).toContain("Biometric modality is required");
  });
});
