import { type APIRequestContext, type Page, expect } from "@playwright/test";

export const TZ = "Asia/Ho_Chi_Minh";

export function todayVN(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dm(date: string): string {
  const [, m, d] = date.split("-");
  return `${d}/${m}`;
}

let counter = 0;

/** Creates a fresh account through the sign-up form and lands on the calendar. */
export async function signUp(page: Page, name = "Người dùng thử"): Promise<string> {
  const email = `e2e-${Date.now()}-${++counter}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Tên hiển thị (không bắt buộc)").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("mat-khau-e2e");
  await page.getByLabel("Nhập lại mật khẩu").fill("mat-khau-e2e");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await page.waitForURL("**/calendar**");
  await expect(page.getByTestId("calendar-title")).toBeVisible();
  return email;
}

export function apiHeaders(page: Page) {
  const origin = new URL(page.url()).origin;
  return { "Content-Type": "application/json", Origin: origin };
}

export async function createTaskViaApi(page: Page, fields: Record<string, unknown>) {
  const res = await page.request.post("/api/tasks", {
    headers: apiHeaders(page),
    data: {
      fields: {
        description: "",
        categoryId: null,
        priority: "medium",
        color: "#3b82f6",
        startTime: null,
        endTime: null,
        untilDate: null,
        weeklyTarget: null,
        recurrence: { type: "none" },
        ...fields,
      },
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { task: { id: string; versions: { id: string }[] } };
}

export async function setStatusViaApi(page: Page | { request: APIRequestContext; url(): string }, taskId: string, originalDate: string, status: string) {
  const res = await page.request.put(`/api/tasks/${taskId}/occurrences`, {
    headers: apiHeaders(page as Page),
    data: { originalDate, status },
  });
  return res;
}
