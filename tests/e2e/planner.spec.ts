import { expect, test } from "@playwright/test";
import { addDays, apiHeaders, createTaskViaApi, dm, setStatusViaApi, signUp, todayVN } from "./helpers";

function mondayOf(date: string): string {
  const wd = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -wd);
}

test.describe("Lịch & công việc", () => {
  test("tạo việc, tích → bỏ tích, và dữ liệu còn nguyên sau khi tải lại trang", async ({ page }) => {
    await signUp(page);
    const today = todayVN();
    await page.goto(`/calendar?view=day&date=${today}`);

    await page.getByTestId("add-task").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Tên công việc").fill("Làm báo cáo tài chính");
    await dialog.getByTestId("task-form-save").click();
    await expect(dialog).toBeHidden();

    const item = () => page.getByTestId("occurrence").filter({ hasText: "Làm báo cáo tài chính" });
    await expect(item()).toHaveCount(1);
    await expect(page.getByTestId("day-progress")).toHaveText("0/1");

    await item().getByRole("checkbox").click();
    await expect(item().getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("day-progress")).toHaveText("1/1");

    await page.reload();
    await expect(item().getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("day-progress")).toHaveText("1/1");

    await item().getByRole("checkbox").click();
    await expect(item().getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("day-progress")).toHaveText("0/1");
    await page.reload();
    await expect(item().getByRole("checkbox")).toHaveAttribute("aria-checked", "false");

    // Rapid clicks: 5 toggles end "completed", counted once.
    for (let i = 0; i < 5; i++) await item().getByRole("checkbox").click();
    await expect(item().getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(async () => {
        const snap = await (await page.request.get("/api/snapshot")).json();
        return snap.occurrences.map((o: { status: string }) => o.status);
      })
      .toEqual(["completed"]);
    await page.reload();
    await expect(page.getByTestId("day-progress")).toHaveText("1/1");
  });

  test("nhập nhanh tiếng Việt: xem trước rồi lưu", async ({ page }) => {
    await signUp(page);
    const tomorrow = addDays(todayVN(), 1);
    await page.locator("#quick-add").fill("Học CFA 2 tiếng vào 19h tối mai");
    const preview = page.getByTestId("quick-add-preview");
    await expect(preview.getByTestId("qa-title")).toHaveText("Học CFA");
    await expect(preview.getByTestId("qa-date")).toContainText(dm(tomorrow));
    await expect(preview.getByTestId("qa-start")).toHaveText("19:00");
    await expect(preview.getByTestId("qa-end")).toHaveText("21:00");
    await page.locator("#quick-add").press("Enter");
    await expect(preview).toBeHidden();
    await page.goto(`/calendar?view=day&date=${tomorrow}`);
    await expect(page.getByTestId("occurrence").filter({ hasText: "Học CFA" })).toContainText("19:00 – 21:00");
  });

  test("thói quen T2/T4/T6 với mục tiêu: ô — không tính bỏ lỡ, thống kê cập nhật ngay", async ({ page }) => {
    await signUp(page);
    const monday = mondayOf(todayVN());
    await page.getByTestId("add-task").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Tên công việc").fill("Tập gym");
    await dialog.getByLabel("Lặp lại").selectOption("specific");
    await dialog.getByRole("button", { name: "T2 → T6" }).click();
    await dialog.getByRole("button", { name: "T3", exact: true }).click();
    await dialog.getByRole("button", { name: "T5", exact: true }).click();
    await dialog.getByLabel("Ngày bắt đầu").fill(monday);
    await dialog.getByLabel("Mục tiêu (số lần mỗi tuần)").fill("3");
    await expect(dialog).toContainText("Hằng tuần vào T2, T4, T6");
    await dialog.getByTestId("task-form-save").click();
    await expect(dialog).toBeHidden();

    await page.getByRole("link", { name: "Thói quen" }).first().click();
    const row = page.getByTestId("habit-row").filter({ hasText: "Tập gym" });
    await expect(row.getByTestId("habit-cell")).toHaveCount(3);
    await expect(row.getByText("—")).toHaveCount(4);
    await expect(row.getByTestId("habit-total")).toHaveText("0/3");

    await row.getByTestId("habit-cell").first().click();
    await expect(row.getByTestId("habit-total")).toHaveText("1/3");
    await expect(row.getByTestId("habit-target")).toHaveText("1/3");
    await expect(page.getByTestId("goal-rate")).toHaveText("33,3%");

    // Untick: back to zero, never double counted.
    await row.getByTestId("habit-cell").first().click();
    await expect(row.getByTestId("habit-total")).toHaveText("0/3");
    await row.getByTestId("habit-cell").first().click();

    await page.getByRole("link", { name: "Thống kê" }).first().click();
    await expect(page.getByTestId("dash-goal-rate")).toHaveText("33,3%");
  });

  test("sửa “lần này và các lần sau” giữ nguyên lịch sử; “chỉ lần này” không ảnh hưởng lần khác", async ({ page }) => {
    await signUp(page);
    const today = todayVN();
    const { task } = await createTaskViaApi(page, {
      title: "Đọc sách",
      recurrence: { type: "daily", interval: 1 },
      startDate: addDays(today, -6),
    });
    expect((await setStatusViaApi(page, task.id, addDays(today, -3), "completed")).status()).toBe(200);

    await page.goto(`/calendar?view=day&date=${today}`);
    await page.getByRole("button", { name: "Chi tiết: Đọc sách" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sửa" }).click();
    await page.getByRole("button", { name: /Lần này và các lần sau/ }).click();
    const form = page.getByRole("dialog");
    await form.getByLabel("Tên công việc").fill("Đọc sách 30 phút");
    await form.getByTestId("task-form-save").click();
    await expect(form).toBeHidden();
    await expect(page.getByTestId("occurrence").filter({ hasText: "Đọc sách 30 phút" })).toHaveCount(1);

    await page.goto(`/calendar?view=day&date=${addDays(today, -3)}`);
    const past = page.getByTestId("occurrence");
    await expect(past).toHaveCount(1);
    await expect(past).toContainText("Đọc sách");
    await expect(past).not.toContainText("30 phút");
    await expect(past.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");

    // Only this occurrence (tomorrow) gets a new time; the day after keeps the series settings.
    await page.goto(`/calendar?view=day&date=${addDays(today, 1)}`);
    await page.getByRole("button", { name: "Chi tiết: Đọc sách 30 phút" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sửa" }).click();
    await page.getByRole("button", { name: /Chỉ lần này/ }).click();
    const form2 = page.getByRole("dialog");
    await form2.getByLabel("Giờ bắt đầu").fill("21:00");
    await form2.getByLabel("Giờ kết thúc").fill("21:30");
    await form2.getByTestId("task-form-save").click();
    await expect(form2).toBeHidden();
    await expect(page.getByTestId("occurrence")).toContainText("21:00 – 21:30");
    await page.goto(`/calendar?view=day&date=${addDays(today, 2)}`);
    await expect(page.getByTestId("occurrence")).not.toContainText("21:00");
  });

  test("tuần giao giữa hai tháng và chuyển năm", async ({ page }) => {
    await signUp(page);
    await createTaskViaApi(page, { title: "Chạy bộ", recurrence: { type: "daily", interval: 1 }, startDate: "2026-11-25" });

    await page.goto("/calendar?view=week&date=2026-12-02");
    await expect(page.getByTestId("calendar-title")).toHaveText("Tuần 49 · 30/11 – 06/12/2026");
    const cols = page.getByTestId("week-grid").locator("[data-date]");
    await expect(cols).toHaveCount(7);
    await expect(cols.first()).toHaveAttribute("data-date", "2026-11-30");
    await expect(cols.last()).toHaveAttribute("data-date", "2026-12-06");

    await page.goto("/calendar?view=week&date=2026-12-31");
    await expect(page.getByTestId("calendar-title")).toHaveText("Tuần 53 · 28/12/2026 – 03/01/2027");
    await expect(cols.first()).toHaveAttribute("data-date", "2026-12-28");
    await expect(cols.last()).toHaveAttribute("data-date", "2027-01-03");
    for (let i = 0; i < 7; i++) await expect(cols.nth(i).getByTestId("occurrence")).toHaveCount(1);
    await page.getByRole("button", { name: "Sau" }).click();
    await expect(page.getByTestId("calendar-title")).toHaveText("Tuần 1 · 04/01 – 10/01/2027");
  });

  test("nhiều tài khoản dùng độc lập, không truy cập được dữ liệu của nhau", async ({ page, browser, baseURL }) => {
    await signUp(page, "A");
    const today = todayVN();
    const { task } = await createTaskViaApi(page, { title: "Bí mật của A", startDate: today });

    const ctxB = await browser.newContext({ baseURL, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
    const pageB = await ctxB.newPage();
    await signUp(pageB, "B");
    await pageB.goto("/tasks");
    await expect(pageB.getByRole("heading", { name: "Quản lý công việc" })).toBeVisible();
    await expect(pageB.getByText("Bí mật của A")).toHaveCount(0);
    const snapB = await (await pageB.request.get("/api/snapshot")).json();
    expect(snapB.tasks).toHaveLength(0);

    const h = apiHeaders(pageB);
    expect((await setStatusViaApi(pageB, task.id, today, "completed")).status()).toBe(404);
    expect((await pageB.request.delete(`/api/tasks/${task.id}`, { headers: h })).status()).toBe(404);
    expect(
      (
        await pageB.request.post(`/api/tasks/${task.id}/end`, { headers: h, data: { fromDate: today } })
      ).status(),
    ).toBe(404);

    const snapA = await (await page.request.get("/api/snapshot")).json();
    expect(snapA.tasks).toHaveLength(1);
    expect(snapA.occurrences).toHaveLength(0);
    await ctxB.close();
  });

  test("bảo mật cơ bản: chặn yêu cầu không cùng nguồn và chưa đăng nhập", async ({ page, request }) => {
    expect((await request.get("/api/snapshot")).status()).toBe(401);
    await signUp(page);
    const cross = await page.request.post("/api/tasks", {
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      data: { fields: { title: "x" } },
    });
    expect(cross.status()).toBe(403);
    const noOrigin = await page.request.post("/api/tasks", { headers: { "Content-Type": "application/json" }, data: {} });
    expect(noOrigin.status()).toBe(403);
    const res = await page.goto("/calendar");
    expect(res?.headers()["x-frame-options"]).toBe("DENY");
  });
});
