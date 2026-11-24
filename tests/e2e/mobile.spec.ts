import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("giao diện điện thoại: lịch ngày, nhập nhanh, thói quen, không tràn ngang", async ({ page }) => {
  await signUp(page);
  await expect(page.getByRole("navigation", { name: "Điều hướng chính" }).last()).toBeVisible();
  // Phones open the daily checklist by default.
  await expect(page.getByRole("radio", { name: "Ngày" })).toHaveAttribute("aria-checked", "true");

  await page.locator("#quick-add").fill("Đọc sách hằng ngày 21h-22h");
  await page.getByTestId("qa-save").click();
  await expect(page.getByTestId("occurrence").filter({ hasText: "Đọc sách" })).toHaveCount(1);

  for (const path of ["/calendar?view=week", "/calendar?view=month", "/habits", "/dashboard", "/tasks", "/settings"]) {
    await page.goto(path);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} không được tràn ngang`).toBeLessThanOrEqual(1);
  }

  await page.goto("/habits");
  const card = page.getByTestId("habit-card").filter({ hasText: "Đọc sách" });
  await expect(card).toBeVisible();
  await card.getByTestId("habit-cell").last().click();
});
