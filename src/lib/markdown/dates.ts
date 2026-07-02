// Minimal calendar math on ISO dates (yyyy-mm-dd) for interactive variables.
// Deliberately dependency-free: expr.ts sits in the server render bundle (for
// identifier analysis), so pulling a date library in would grow the worker for
// math only clients run. Everything works in UTC on whole days, so results are
// timezone-stable and deterministic.

export interface IsoDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

function toNumber(text: string): number | null {
  if (text.length === 0) return null;
  for (const ch of text) if (ch < "0" || ch > "9") return null;
  return Number(text);
}

/** Parses strict `yyyy-mm-dd`, rejecting impossible dates (2026-02-31). */
export function parseIsoDate(text: string): IsoDate | null {
  const parts = text.trim().split("-");
  if (parts.length !== 3 || parts[0].length !== 4 || parts[1].length !== 2 || parts[2].length !== 2)
    return null;
  const year = toNumber(parts[0]);
  const month = toNumber(parts[1]);
  const day = toNumber(parts[2]);
  if (year === null || month === null || day === null) return null;
  // Round-trip through Date.UTC: an overflowing day rolls the month, which the
  // comparison catches.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function formatIsoDate(date: IsoDate): string {
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  return `${String(date.year).padStart(4, "0")}-${mm}-${dd}`;
}

function utcMillis(date: IsoDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

const DAY_MS = 86_400_000;

export type DateUnit = "days" | "weeks" | "months" | "years";

/** Normalizes a unit word ("day", "Days", "weeks"...) or null when unknown. */
export function parseDateUnit(text: string): DateUnit | null {
  const unit = text.trim().toLowerCase();
  const base = unit.endsWith("s") ? unit : `${unit}s`;
  return base === "days" || base === "weeks" || base === "months" || base === "years" ? base : null;
}

/** Calendar-aware addition. Days/weeks are exact; months/years clamp the day
 *  into the target month (Jan 31 + 1 month = Feb 28/29), the common contract. */
export function addToDate(date: IsoDate, amount: number, unit: DateUnit): IsoDate {
  const n = Math.trunc(amount);
  if (unit === "days" || unit === "weeks") {
    const shifted = new Date(utcMillis(date) + n * (unit === "weeks" ? 7 : 1) * DAY_MS);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
    };
  }
  const monthsToAdd = unit === "months" ? n : n * 12;
  const zeroBased = date.year * 12 + (date.month - 1) + monthsToAdd;
  const year = Math.floor(zeroBased / 12);
  const month = (zeroBased % 12) + 1;
  // Clamp into the target month's length (Date.UTC day 0 = last day of the
  // previous month).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day: Math.min(date.day, lastDay) };
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((utcMillis(to) - utcMillis(from)) / DAY_MS);
}

/** ISO weekday, 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: IsoDate): number {
  const day = new Date(utcMillis(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Today as an ISO date string, in the machine's local calendar day. Only ever
 *  called on the client (the server never evaluates expressions); tests inject
 *  a fixed value through evaluateExpression instead of calling this. */
export function isoToday(): string {
  const now = new Date();
  return formatIsoDate({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  });
}
