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

  await page.waitForURL("**/employees", { timeout: 30_000 });

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
  const openShiftReq = page.waitForResponse(
    (resp) =>
      resp.request().method() === "GET" &&
      resp.url().includes("/api/attendance/open"),
    { timeout: 30_000 }
  );
  await page.getByLabel("Select Employee").click();
  await page.getByRole("option", { name: "John Doe" }).click();
  await openShiftReq;

  const clockInButton = page.getByRole("button", { name: "Clock In" });
  const clockOutButton = page.getByRole("button", { name: "Clock Out" });

  const initialMode = (await clockOutButton.isVisible()) ? "out" : "in";

  if (initialMode === "out") {
    const preClockOutReq = page.waitForResponse(
      (resp) =>
        resp.request().method() === "POST" &&
        resp.url().includes("/api/attendance/clockout"),
      { timeout: 30_000 }
    );
    await clockOutButton.click();
    const preClockOutResp = await preClockOutReq;
    const preClockOutBody = await preClockOutResp.text();
    if (
      preClockOutResp.status() !== 200 &&
      !(
        preClockOutResp.status() === 400 &&
        preClockOutBody.includes("No open shift")
      )
    ) {
      expect(preClockOutResp.status(), preClockOutBody).toBe(200);
    }
  }

  const clockInReq = page.waitForResponse(
    (resp) =>
      resp.request().method() === "POST" &&
      resp.url().includes("/api/attendance/clockin"),
    { timeout: 30_000 }
  );
  await expect(clockInButton).toBeVisible({ timeout: 30_000 });
  await clockInButton.click();
  const clockInResp = await clockInReq;
  const clockInBody = await clockInResp.text();
  if (
    clockInResp.status() === 400 &&
    clockInBody.includes("Open shift exists")
  ) {
    const fixClockOutReq = page.waitForResponse(
      (resp) =>
        resp.request().method() === "POST" &&
        resp.url().includes("/api/attendance/clockout"),
      { timeout: 30_000 }
    );
    await expect(clockOutButton).toBeVisible({ timeout: 30_000 });
    await clockOutButton.click();
    const fixClockOutResp = await fixClockOutReq;
    const fixClockOutBody = await fixClockOutResp.text();
    expect(fixClockOutResp.status(), fixClockOutBody).toBe(200);

    const retryClockInReq = page.waitForResponse(
      (resp) =>
        resp.request().method() === "POST" &&
        resp.url().includes("/api/attendance/clockin"),
      { timeout: 30_000 }
    );
    await expect(clockInButton).toBeVisible({ timeout: 30_000 });
    await clockInButton.click();
    const retryClockInResp = await retryClockInReq;
    const retryClockInBody = await retryClockInResp.text();
    expect(retryClockInResp.status(), retryClockInBody).toBe(200);
  } else {
    expect(clockInResp.status(), clockInBody).toBe(200);
  }

  const clockOutReq = page.waitForResponse(
    (resp) =>
      resp.request().method() === "POST" &&
      resp.url().includes("/api/attendance/clockout"),
    { timeout: 30_000 }
  );
  await expect(clockOutButton).toBeVisible({ timeout: 30_000 });
  await clockOutButton.click();
  const clockOutResp = await clockOutReq;
  const clockOutBody = await clockOutResp.text();
  expect(clockOutResp.status(), clockOutBody).toBe(200);

  await page.goto("/employees");
  await page.waitForURL("**/employees");

  const employeeAttendanceReq = page.waitForResponse(
    (resp) =>
      resp.request().method() === "GET" &&
      resp.url().includes("/api/attendance/employee"),
    { timeout: 30_000 }
  );
  await page.locator("table").getByText("John Doe").first().click();
  const employeeAttendanceResp = await employeeAttendanceReq;
  const employeeAttendanceBody = await employeeAttendanceResp.text();
  expect(employeeAttendanceResp.status(), employeeAttendanceBody).toBe(200);

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Attendance & Leaves")).toBeVisible();
  await expect(dialog.getByText(/In \d{2}:\d{2}/).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(dialog.getByText(/Out \d{2}:\d{2}/).first()).toBeVisible({
    timeout: 30_000,
  });
});
