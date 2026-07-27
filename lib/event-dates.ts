const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function dateTimestamp(value: string) {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

function dateFromTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isIsoDate(value: string) {
  return dateTimestamp(value) !== null;
}

export function eventDayForDate(startsOn: string, targetOn: string) {
  const startsAt = dateTimestamp(startsOn);
  const targetAt = dateTimestamp(targetOn);
  if (startsAt === null || targetAt === null) return null;
  return Math.round((targetAt - startsAt) / DAY_IN_MILLISECONDS) + 1;
}

export function eventDateForDay(startsOn: string, eventDay: number) {
  const startsAt = dateTimestamp(startsOn);
  if (
    startsAt === null ||
    !Number.isInteger(eventDay) ||
    eventDay < 1
  ) {
    return null;
  }
  return dateFromTimestamp(startsAt + (eventDay - 1) * DAY_IN_MILLISECONDS);
}

export function eventDurationDays(
  startsOn: string,
  endsOn: string | null | undefined,
) {
  if (!isIsoDate(startsOn)) return null;
  if (!endsOn) return 1;

  const lastDay = eventDayForDate(startsOn, endsOn);
  return lastDay !== null && lastDay >= 1 ? lastDay : null;
}

export function isEventDayWithinEvent(
  startsOn: string,
  endsOn: string | null | undefined,
  eventDay: number,
) {
  const duration = eventDurationDays(startsOn, endsOn);
  return (
    duration !== null &&
    Number.isInteger(eventDay) &&
    eventDay >= 1 &&
    eventDay <= duration
  );
}

export function formatWishlistDate(startsOn: string, wishlistDay: number) {
  const wishlistOn = eventDateForDay(startsOn, wishlistDay);
  if (!wishlistOn) return "";
  const [, month, day] = wishlistOn.split("-").map(Number);
  return `${month}/${day}（${wishlistDay}日目）`;
}

export function formatEventDateRange(
  startsOn: string,
  endsOn: string | null | undefined,
) {
  const startDate = eventDateForDay(startsOn, 1);
  if (!startDate) return "";
  const [, startMonth, startDay] = startDate.split("-").map(Number);
  const startLabel = `${startMonth}/${startDay}`;
  if (!endsOn || endsOn === startsOn) return startLabel;

  const duration = eventDurationDays(startsOn, endsOn);
  if (!duration) return startLabel;
  const endDate = eventDateForDay(startsOn, duration);
  if (!endDate) return startLabel;
  const [, endMonth, endDay] = endDate.split("-").map(Number);
  return `${startLabel}〜${endMonth}/${endDay}`;
}
