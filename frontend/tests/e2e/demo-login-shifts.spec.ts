import { test, expect } from "@playwright/test";

test("demo tenant: login, create a shift, and clock in/out", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.addInitScript(() => {
    localStorage.setItem("tenant", "demo");
  });

  await page.goto("/login");

  await page.getByLabel("Email").fill("owner@tenant.com");
  await page.getByRole("textbox", { name: "Password" }).fill("secret");
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  await page.goto("/shifts");
  await page.waitForURL("**/shifts");

  await page.getByRole("button", { name: "New Shift" }).click();

  const shiftName = `PW Shift ${Date.now()}`;
  await page.getByLabel("Shift Name").fill(shiftName);

  page.on("dialog", async (d) => {
    await d.dismiss();
  });

  const createReq = page.waitForResponse(
    (resp) =>
      resp.request().method() === "POST" && resp.url().includes("/api/shifts"),
    { timeout: 30_000 }
  );
  const refreshReq = page.waitForResponse(
    (resp) =>
      resp.request().method() === "GET" && resp.url().includes("/api/shifts"),
    { timeout: 30_000 }
  );

  await page.getByRole("button", { name: "Save" }).click();
  const createResp = await createReq;
  const createBody = await createResp.text();
  expect(createResp.status(), createBody).toBe(200);

  const refreshResp = await refreshReq;
  const refreshBody = await refreshResp.text();
  expect(refreshResp.status(), refreshBody).toBe(200);

  await expect(page.getByText(shiftName)).toBeVisible({ timeout: 20_000 });

  await page.goto("/clock");
  await page.waitForURL("**/clock");

  await expect(page.getByRole("heading", { name: "Time Clock" })).toBeVisible();
  await page.getByLabel("Select Employee").click();
  await page.getByRole("option", { name: "John Doe" }).click();

  const clockInReq = page.waitForResponse(
    (resp) =>
      resp.request().method() === "POST" &&
      resp.url().includes("/api/attendance/clockin"),
    { timeout: 30_000 }
  );
  await page.getByRole("button", { name: "Clock In" }).click();
  const clockInResp = await clockInReq;
  const clockInBody = await clockInResp.text();
  expect(clockInResp.status(), clockInBody).toBe(200);

  const clockOutReq = page.waitForResponse(
    (resp) =>
      resp.request().method() === "POST" &&
      resp.url().includes("/api/attendance/clockout"),
    { timeout: 30_000 }
  );
  await page.getByRole("button", { name: "Clock Out" }).click();
  const clockOutResp = await clockOutReq;
  const clockOutBody = await clockOutResp.text();
  expect(clockOutResp.status(), clockOutBody).toBe(200);
});
