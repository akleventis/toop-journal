const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Returns the current date in journal format: `Jun 14, 2025 at 12:35`
export function formatCurrentDate(): string {
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'short' });
  const day = now.getDate();
  const year = now.getFullYear();
  const time = now.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${month} ${day}, ${year} at ${time}`;
}

// Returns the current date in calendar format: `2025-06-14`
export function getCurrentCalendarDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Breaks a journal date string into display parts: `Jun 14, 2025 at 12:35` → `{ year, month, day, weekday }`
export function getDateParts(dateStr: string): { year: number; month: string; day: number; weekday: string } {
  const date = new Date(dateStr.replace(/ at .*/, ''));
  return {
    year: date.getFullYear(),
    month: date.toLocaleString('en-US', { month: 'short' }),
    day: date.getDate(),
    weekday: date.toLocaleString('en-US', { weekday: 'short' }),
  };
}

// Converts a journal date string to a Unix timestamp (ms). Returns NaN if unparseable.
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

// Generates a DB entry ID from a journal date string: `Jun 14, 2025 at 12:35` → `jun.14.2025`
export function journalDateToId(date: string): string {
  const [datePart] = date.split(' at ');
  const [month, day, year] = datePart.replace(',', '').split(' ');
  return `${month.toLowerCase()}.${day}.${year}`;
}

// Returns the number of days in a given month. Month is 0-indexed.
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Returns the weekday index (0=Sun) of the first day of a given month. Month is 0-indexed.
export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// date format conversions

// `Jun 14, 2025 at 12:35` → `2025-06-14`
export function journalToCalendar(journalDate: string): string {
  const [datePart] = journalDate.split(' at ');
  const [month, day, year] = datePart.replace(',', '').split(' ');
  const monthIndex = MONTH_NAMES.indexOf(month) + 1;
  return `${year}-${String(monthIndex).padStart(2, '0')}-${String(parseInt(day)).padStart(2, '0')}`;
}

// `2025-06-14` → `Jun 14, 2025 at 12:35` (current time)
export function calendarToJournal(calendarDate: string): string {
  const [year, month, day] = calendarDate.split('-');
  const monthName = MONTH_NAMES[parseInt(month) - 1];
  const currentTime = new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${monthName} ${parseInt(day)}, ${year} at ${currentTime}`;
}

// Builds a calendar date string from parts. Month is 0-indexed: (2025, 5, 14) → `2025-06-14`
export function createCalendarDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
