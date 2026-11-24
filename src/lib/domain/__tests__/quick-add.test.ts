import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "../quick-add";

// Tuesday 24/11/2026
const TODAY = "2026-11-24";

describe("quick add (Vietnamese natural language)", () => {
  it("spec example: 'Học CFA 2 tiếng vào 19h tối mai'", () => {
    const d = parseQuickAdd("Học CFA 2 tiếng vào 19h tối mai", TODAY);
    expect(d).toMatchObject({
      title: "Học CFA",
      date: "2026-11-25",
      startTime: "19:00",
      endTime: "21:00",
      recurrence: { type: "none" },
      categoryHint: "study",
    });
  });

  it("works without accents", () => {
    const d = parseQuickAdd("hoc cfa 2 tieng luc 19h toi mai", TODAY);
    expect(d).toMatchObject({ title: "Hoc cfa", date: "2026-11-25", startTime: "19:00", endTime: "21:00" });
  });

  it("weekday lists become a weekly repetition", () => {
    const d = parseQuickAdd("Gym thứ 2, 4, 6 lúc 6h sáng", TODAY);
    expect(d).toMatchObject({
      title: "Gym",
      startTime: "06:00",
      recurrence: { type: "weekly", interval: 1, weekdays: [1, 3, 5] },
      categoryHint: "health",
    });
    expect(parseQuickAdd("Học tiếng Anh T3 T5 T7 20h", TODAY)).toMatchObject({
      title: "Học tiếng Anh",
      startTime: "20:00",
      recurrence: { type: "weekly", weekdays: [2, 4, 6] },
    });
  });

  it("daily with a time range", () => {
    expect(parseQuickAdd("Đọc sách hằng ngày 21h-22h", TODAY)).toMatchObject({
      title: "Đọc sách",
      startTime: "21:00",
      endTime: "22:00",
      recurrence: { type: "daily", interval: 1 },
    });
  });

  it("target and weekday range: 'Học CFA Level I 5 lần/tuần thứ 2 đến thứ 6'", () => {
    expect(parseQuickAdd("Học CFA Level I 5 lần/tuần thứ 2 đến thứ 6", TODAY)).toMatchObject({
      title: "Học CFA Level I",
      weeklyTarget: 5,
      recurrence: { type: "weekly", weekdays: [1, 2, 3, 4, 5] },
    });
  });

  it("explicit dates and next-week weekdays", () => {
    expect(parseQuickAdd("Làm báo cáo tài chính 25/11", TODAY)).toMatchObject({
      title: "Làm báo cáo tài chính",
      date: "2026-11-25",
      categoryHint: "work",
    });
    expect(parseQuickAdd("Họp nhóm thứ 6 tuần sau 14h-15h30", TODAY)).toMatchObject({
      title: "Họp nhóm",
      date: "2026-12-04",
      startTime: "14:00",
      endTime: "15:30",
    });
    // 05/01 is in the past this year, so it means January next year.
    expect(parseQuickAdd("Nộp thuế 05/01", TODAY).date).toBe("2027-01-05");
  });

  it("minutes durations and morning times", () => {
    expect(parseQuickAdd("Chạy bộ 30 phút 5h30 sáng mai", TODAY)).toMatchObject({
      title: "Chạy bộ",
      date: "2026-11-25",
      startTime: "05:30",
      endTime: "06:00",
    });
    expect(parseQuickAdd("Tập yoga 7h tối", TODAY)).toMatchObject({ title: "Tập yoga", date: TODAY, startTime: "19:00" });
  });

  it("does not mistake ordinary words for dates", () => {
    expect(parseQuickAdd("Kiểm tra thứ tự sách", TODAY)).toMatchObject({ title: "Kiểm tra thứ tự sách", date: TODAY });
    expect(parseQuickAdd("Gặp Mai ở quán cà phê lúc 15h", TODAY)).toMatchObject({
      title: "Gặp Mai ở quán cà phê",
      date: TODAY,
      startTime: "15:00",
    });
    expect(parseQuickAdd("Nộp hồ sơ thứ tư", TODAY)).toMatchObject({ title: "Nộp hồ sơ", date: "2026-11-25" });
  });

  it("monthly on a day and priority words", () => {
    expect(parseQuickAdd("Đóng tiền nhà ngày 5 hằng tháng gấp", TODAY)).toMatchObject({
      title: "Đóng tiền nhà",
      date: "2026-12-05",
      priority: "high",
      recurrence: { type: "monthly", monthly: { mode: "dayOfMonth", day: 5 } },
    });
  });

  it("falls back to the raw text when nothing is recognised", () => {
    expect(parseQuickAdd("viết nhật ký", TODAY)).toMatchObject({ title: "Viết nhật ký", date: TODAY, startTime: null });
  });
});
