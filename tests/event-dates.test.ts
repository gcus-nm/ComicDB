import { describe, expect, it } from "vitest";
import {
  eventDateForDay,
  eventDayForDate,
  eventDurationDays,
  formatEventDateRange,
  formatWishlistDate,
  isEventDayWithinEvent,
} from "@/lib/event-dates";
import {
  eventInputSchema,
  wishlistItemInputSchema,
} from "@/lib/validators";

describe("イベント日付", () => {
  it("開始日を1日目として対象日を表示する", () => {
    expect(eventDayForDate("2026-08-11", "2026-08-12")).toBe(2);
    expect(eventDateForDay("2026-08-11", 2)).toBe("2026-08-12");
    expect(formatWishlistDate("2026-08-11", 2)).toBe("8/12（2日目）");
    expect(formatWishlistDate("2026-08-11", 1)).toBe("8/11（1日目）");
  });

  it("月末、年末、うるう日をまたいで計算する", () => {
    expect(eventDateForDay("2026-12-31", 2)).toBe("2027-01-01");
    expect(eventDayForDate("2026-12-31", "2027-01-02")).toBe(3);
    expect(eventDateForDay("2028-02-28", 2)).toBe("2028-02-29");
  });

  it("開催期間外の日付を拒否する", () => {
    expect(eventDurationDays("2026-08-11", "2026-08-13")).toBe(3);
    expect(isEventDayWithinEvent("2026-08-11", "2026-08-13", 2)).toBe(
      true,
    );
    expect(isEventDayWithinEvent("2026-08-11", "2026-08-13", 0)).toBe(
      false,
    );
    expect(isEventDayWithinEvent("2026-08-11", "2026-08-13", 4)).toBe(
      false,
    );
    expect(isEventDayWithinEvent("2026-08-11", null, 2)).toBe(false);
    expect(formatEventDateRange("2026-08-11", "2026-08-13")).toBe(
      "8/11〜8/13",
    );
  });

  it("イベント入力の日付関係を検証する", () => {
    const valid = {
      name: "複数日イベント",
      startsOn: "2026-08-11",
      endsOn: "2026-08-13",
    };
    expect(eventInputSchema.safeParse(valid).success).toBe(true);
    expect(
      eventInputSchema.safeParse({
        ...valid,
        endsOn: "2026-08-10",
      }).success,
    ).toBe(false);
    expect(wishlistItemInputSchema.safeParse({ title: "新刊" }).success).toBe(
      true,
    );
    expect(
      wishlistItemInputSchema.safeParse({
        title: "新刊",
        eventDay: 0,
      }).success,
    ).toBe(false);
  });
});
