// Validates ID format: "feb.25.2018"
export function validateID(id: string): void {
  const regex = /^[a-z]{3}\.\d{1,2}\.\d{4}$/;
  if (!regex.test(id)) {
    throw new Error('INVALID_ID: must be in format "feb.25.2018"');
  }
}

// Returns the date parts of a journal date string
export function getDateParts(dateStr: string) {
  const date = new Date(dateStr.replace(/ at .*/, ''));
  return {
    year: date.getFullYear(),
    month: date.toLocaleString('en-US', { month: 'short' }),
    day: date.getDate(),
    weekday: date.toLocaleString('en-US', { weekday: 'short' }),
  };
}

// Validates date format: "Feb 27, 2018 at 15:14:10"
export function validateDate(date: string): void {
  const regex = /^[A-Z][a-z]{2} \d{1,2}, \d{4} at \d{2}:\d{2}:\d{2}$/;
  if (!regex.test(date)) {
    throw new Error('INVALID_DATE: must be in format "Feb 27, 2018 at 15:14:10"');
  }
}

// Formats current date to "Feb 27, 2018 at 15:14:10"
export function formatCurrentDate(): string {
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'short' });
  const day = now.getDate();
  const year = now.getFullYear();
  const time = now.toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${month} ${day}, ${year} at ${time}`;
}

// Formats current date to "2018-02-27"
export function formatCurrentDateToYearMonthDay(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.toLocaleString('en-US', { month: 'numeric' });
  const day = now.getDate();
  return `${year}-${month}-${day}`;
}

// Parses a journal date string in the format 'May 26, 2018 at 16:00:00' to a timestamp
export function parseJournalDate(dateStr: string): number {
  const [datePart, timePart] = dateStr.split(' at ');
  if (!datePart || !timePart) return NaN;
  const [month, day, year] = datePart.replace(',', '').split(' ');
  if (!month || !day || !year) return NaN;
  const monthIndex = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ].indexOf(month);
  if (monthIndex === -1) return NaN;
  const iso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${day.padStart(
    2,
    '0'
  )}T${timePart}`;
  return new Date(iso).getTime();
}

// Generates ID in format: "feb.25.2018"
export function generateIdFromDate(date: string): string {
  const [datePart] = date.split(' at ');
  const [month, day, year] = datePart.replace(',', '').split(' ');
  return `${month.toLowerCase()}.${day}.${year}`;
}

// Encodes HTML entities in a string
export function encodeHtmlEntities(rawHtml: string): string {
  const textarea = document.createElement('textarea');
  textarea.textContent = rawHtml;
  return textarea.innerHTML;
}

// Formats a date from ID (e.g., "jun.13.2025") with current time
export function formatDateFromId(id: string): string {
  const currentDateStr = formatCurrentDate();
  const timePart = currentDateStr.split(' at ')[1];

  const [month, day, year] = id.split('.');
  return `${month.charAt(0).toUpperCase() + month.slice(1)} ${day}, ${year} at ${timePart}`;
}

// Converts journal date format to YYYY-MM-DD format for calendar matching
export function journalDateToCalendarFormat(journalDate: string): string {
  const [datePart] = journalDate.split(' at ');
  const [month, day, year] = datePart.replace(',', '').split(' ');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = monthNames.indexOf(month) + 1;
  return `${year}-${String(monthIndex).padStart(2, '0')}-${String(parseInt(day)).padStart(2, '0')}`;
}

// Creates YYYY-MM-DD format from year, month, and day numbers
export function createCalendarDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Converts YYYY-MM-DD format to journal date format with current time
export function calendarDateToJournalFormat(calendarDate: string): string {
  const [year, month, day] = calendarDate.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthNames[parseInt(month) - 1];
  const currentTime = new Date().toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${monthName} ${parseInt(day)}, ${year} at ${currentTime}`;
}

// Simple hash function for passwords
export function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
}

const __decodeCache = new Map<string, string>();
let __decoder: HTMLTextAreaElement | null = null;

export function decodeHtmlEntities(encoded: string): string {
  const cached = __decodeCache.get(encoded);
  if (cached !== undefined) return cached;
  console.log('decodeHtmlEntities not cached');
  if (!__decoder) __decoder = document.createElement('textarea');
  __decoder.innerHTML = encoded;
  const v = __decoder.value || '';
  __decodeCache.set(encoded, v);
  return v;
}