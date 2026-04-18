const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Returns the current date in journal format: `Jun 14, 2025 at 12:35`
 *
 * @returns {string}
 */
export function formatCurrentDate(): string {
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'short' });
  const day = now.getDate();
  const year = now.getFullYear();
  const time = now.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${month} ${day}, ${year} at ${time}`;
}

/**
 * Returns the current date in calendar format: `2025-06-14`
 *
 * @returns {string}
 */
export function getCurrentCalendarDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Breaks a journal date string into display parts.
 * e.g. `Jun 14, 2025 at 12:35` → `{ year: 2025, month: 'Jun', day: 14, weekday: 'Sat' }`
 *
 * @param {string} dateStr - Journal date string.
 * @returns {{ year: number; month: string; day: number; weekday: string }}
 */
export function getDateParts(dateStr: string): { year: number; month: string; day: number; weekday: string } {
  const date = new Date(dateStr.replace(/ at .*/, ''));
  return {
    year: date.getFullYear(),
    month: date.toLocaleString('en-US', { month: 'short' }),
    day: date.getDate(),
    weekday: date.toLocaleString('en-US', { weekday: 'short' }),
  };
}

/**
 * Converts a journal date string to a Unix timestamp (ms).
 * e.g. `Jun 14, 2025 at 12:35:55` → 1749926155000
 *
 * @param {string} dateStr - Journal date string.
 * @returns {number} Unix timestamp in ms, or NaN if unparseable.
 */
export function parseJournalDate(dateStr: string): number {
  const [datePart, timePart] = dateStr.split(' at ');
  if (!datePart || !timePart) return NaN;
  const [month, day, year] = datePart.replace(',', '').split(' ');
  if (!month || !day || !year) return NaN;
  const monthIndex = MONTH_NAMES.indexOf(month);
  if (monthIndex === -1) return NaN;
  const iso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${day.padStart(2, '0')}T${timePart}`;
  return new Date(iso).getTime();
}

/**
 * Generates a DB entry ID from a journal date string.
 * e.g. `Jun 14, 2025 at 12:35` → `jun.14.2025`
 *
 * @param {string} date - Journal date string.
 * @returns {string}
 */
export function journalDateToId(date: string): string {
  const [datePart] = date.split(' at ');
  const [month, day, year] = datePart.replace(',', '').split(' ');
  return `${month.toLowerCase()}.${day}.${year}`;
}

// date format conversions

/**
 * Journal date → calendar date.
 * e.g. `Jun 14, 2025 at 12:35` → `2025-06-14`
 *
 * @param {string} journalDate
 * @returns {string}
 */
export function journalToCalendar(journalDate: string): string {
  const [datePart] = journalDate.split(' at ');
  const [month, day, year] = datePart.replace(',', '').split(' ');
  const monthIndex = MONTH_NAMES.indexOf(month) + 1;
  return `${year}-${String(monthIndex).padStart(2, '0')}-${String(parseInt(day)).padStart(2, '0')}`;
}

/**
 * Calendar date → journal date with current time.
 * e.g. `2025-06-14` → `Jun 14, 2025 at 12:35`
 *
 * @param {string} calendarDate
 * @returns {string}
 */
export function calendarToJournal(calendarDate: string): string {
  const [year, month, day] = calendarDate.split('-');
  const monthName = MONTH_NAMES[parseInt(month) - 1];
  const currentTime = new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${monthName} ${parseInt(day)}, ${year} at ${currentTime}`;
}

/**
 * Builds a calendar date string from numeric parts.
 * e.g. (2025, 5, 14) → `2025-06-14`  (month is 0-indexed)
 *
 * @param {number} year
 * @param {number} month - 0-indexed.
 * @param {number} day
 * @returns {string}
 */
export function createCalendarDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
