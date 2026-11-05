/**
 * IST (Indian Standard Time, UTC+05:30) Calendar Date Utilities.
 * 
 * In financial ledgers, fee dues and overdue days must be calculated against
 * calendar dates in IST rather than raw UTC timestamps to avoid midnight boundary
 * off-by-one errors (e.g., 11:30 PM UTC is 5:00 AM IST next day).
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // +05:30 in milliseconds

export interface ISTDateParts {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
}

/**
 * Checks whether a string is already in YYYY-MM-DD format.
 */
function isCalendarDateString(val: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(val.trim());
}

/**
 * Extract calendar date parts (year, month 1-12, day 1-31) in IST.
 */
export function parseISTDateParts(input: Date | string | number): ISTDateParts {
  if (typeof input === "string" && isCalendarDateString(input)) {
    const [y, m, d] = input.trim().split("-").map(Number);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return { year: y, month: m, day: d };
    }
  }

  const dateObj = input instanceof Date ? input : new Date(input);
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid date input: ${String(input)}`);
  }

  // Shift UTC time by +05:30 to extract IST calendar parts using UTC getters
  const istDate = new Date(dateObj.getTime() + IST_OFFSET_MS);

  return {
    year: istDate.getUTCFullYear(),
    month: istDate.getUTCMonth() + 1,
    day: istDate.getUTCDate(),
  };
}

/**
 * Formats a date or timestamp to an IST calendar date string: "YYYY-MM-DD".
 */
export function toISTCalendarDateString(input: Date | string | number): string {
  if (typeof input === "string" && isCalendarDateString(input)) {
    return input.trim();
  }

  const { year, month, day } = parseISTDateParts(input);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Returns the number of days in a given year and month (1-12).
 */
export function getDaysInMonth(year: number, month: number): number {
  // Setting day 0 of month+1 gives the last day of month
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Adds whole calendar months to an IST date, clamping to month-end when needed
 * (e.g. 2026-01-31 + 1 month -> 2026-02-28).
 * Returns the resulting date formatted as "YYYY-MM-DD".
 */
export function addMonthsToISTDate(input: Date | string | number, monthsToAdd: number): string {
  const parts = parseISTDateParts(input);

  const totalMonths = (parts.year * 12) + (parts.month - 1) + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1; // 1-12

  const maxDays = getDaysInMonth(targetYear, targetMonth);
  const targetDay = Math.min(parts.day, maxDays);

  const mm = String(targetMonth).padStart(2, "0");
  const dd = String(targetDay).padStart(2, "0");
  return `${targetYear}-${mm}-${dd}`;
}

/**
 * Computes the exact whole calendar days difference in IST: (toDate - fromDate).
 * Positive if toDate is later than fromDate.
 */
export function calendarDaysDifferenceIST(
  fromDate: Date | string | number,
  toDate: Date | string | number
): number {
  const pFrom = parseISTDateParts(fromDate);
  const pTo = parseISTDateParts(toDate);

  const utcFrom = Date.UTC(pFrom.year, pFrom.month - 1, pFrom.day);
  const utcTo = Date.UTC(pTo.year, pTo.month - 1, pTo.day);

  const diffMs = utcTo - utcFrom;
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

