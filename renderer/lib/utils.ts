import { Entry } from "./types";
import * as db from '../db/db';

// ============================================================================
// Date Formatting
// ============================================================================

/**
 * Formats current date to `Jun 14, 2025 at 12:35:55`
 *
 * @returns {string} The formatted date.
 */
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

/**
 * Formats current date to `2025-06-14`
 *
 * @returns {string} The formatted date.
 */
export function getCurrentCalendarDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================================
// Date Parsing & Conversion
// ============================================================================

/**
 * Converts a journal date string `Jun 14, 2025 at 12:35:55` to a object containing the year, month, day, and weekday.
 *
 * @param {string} dateStr - The date string to convert.
 * @returns {Object} An object containing the year, month, day, and weekday.
 */
export function getDateParts(dateStr: string): { year: number, month: string, day: number, weekday: string } {
  const date = new Date(dateStr.replace(/ at .*/, ''));
  return {
    year: date.getFullYear(),
    month: date.toLocaleString('en-US', { month: 'short' }),
    day: date.getDate(),
    weekday: date.toLocaleString('en-US', { weekday: 'short' }),
  };
}

/**
 * Converts a journal date string `Jun 14, 2025 at 12:35:55` to a timestamp.
 *
 * @param {string} dateStr - The date string to convert.
 * @returns {number} The timestamp.
 * @throws {Error} If the date string is not in the correct format.
 */
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

/**
 * Generates ID in format: "jun.14.2025" from a journal date string `Jun 14, 2025 at 12:35:55`.
 *
 * @param {string} date - The date to generate the ID from.
 * @returns {string} The generated ID.
 */
export function journalDateToId(date: string): string {
  const [datePart] = date.split(' at ');
  const [month, day, year] = datePart.replace(',', '').split(' ');
  return `${month.toLowerCase()}.${day}.${year}`;
}

// ============================================================================
// Calendar Format Conversion
// ============================================================================

/**
 * Converts a journal date string `Jun 14, 2025 at 12:35:55` to a YYYY-MM-DD format for calendar matching.
 *
 * @param {string} journalDate - The journal date to convert.
 * @returns {string} The converted date.
 */
export function journalToCalendar(journalDate: string): string {
  const [datePart] = journalDate.split(' at ');
  const [month, day, year] = datePart.replace(',', '').split(' ');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = monthNames.indexOf(month) + 1;
  return `${year}-${String(monthIndex).padStart(2, '0')}-${String(parseInt(day)).padStart(2, '0')}`;
}

/**
 * Creates a YYYY-MM-DD format from year, month, and day numbers.
 *
 * @param {number} year - The year.
 * @param {number} month - The month.
 * @param {number} day - The day.
 * @returns {string} The created date.
 */
export function createCalendarDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Converts a YYYY-MM-DD format to a journal date string `Jun 14, 2025 at 12:35:55` with current time.
 *
 * @param {string} calendarDate - The calendar date to convert.
 * @returns {string} The converted date.
 */
export function calendarToJournal(calendarDate: string): string {
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

// ============================================================================
// HTML Entity Handling
// ============================================================================

/**
 * Encodes HTML entities in a string.
 *
 * @param {string} rawHtml - The HTML string to encode.
 * @returns {string} The encoded HTML string.
 */
export function encodeHtmlEntities(rawHtml: string): string {
  const textarea = document.createElement('textarea');
  textarea.textContent = rawHtml;
  return textarea.innerHTML;
}

const __decodeCache = new Map<string, string>();
let __decoder: HTMLTextAreaElement | null = null;

/**
 * Decodes HTML entities in a string.
 *
 * @param {string} encoded - The encoded string to decode.
 * @returns {string} The decoded string.
 */
export function decodeHtmlEntities(encoded: string): string {
  const cached = __decodeCache.get(encoded);
  if (cached !== undefined) return cached;
  if (!__decoder) __decoder = document.createElement('textarea');
  __decoder.innerHTML = encoded;
  const v = __decoder.value || '';
  __decodeCache.set(encoded, v);
  return v;
}

// ============================================================================
// Database Operations
// ============================f================================================

/**
 * Saves an entry to the database (creates or updates).
 *
 * @param {string} currentHtml - The current HTML content to save.
 * @param {Entry | null} entry - The entry being edited (or null for new entry).
 * @param {Function} navigate - The navigate function from react-router.
 * @returns {Promise<void>}
 */
export async function saveEntry(
  currentHtml: string,
  entry: Entry | null,
  navigate: (path: string) => void
): Promise<void> {
  const encodedHtml = encodeHtmlEntities(currentHtml);

  if (currentHtml === '' || currentHtml === '<br>' || currentHtml === '<p><br></p>') {
    alert('empty! please enter thoughts')
    return;
  }

  let exists = false;
  if (entry) {
    exists = await db.getEntryById(entry.id) !== null;
  }

  if (exists && entry) {
    await db.updateEntry(entry.id, { content: encodedHtml });
  } else {
    const entryDate = formatCurrentDate();
    const newEntry = {
      id: journalDateToId(entryDate),
      date: entryDate,
      content: encodedHtml
    };
    await db.createEntry(newEntry);
  }
  navigate('/list?reload=true');
}

/**
 * Deletes an entry from the database.
 *
 * @param {string} id - The ID of the entry to delete.
 * @param {Function} navigate - The navigate function from react-router.
 * @returns {Promise<void>}
 */
export async function deleteEntry(id: string, navigate: (path: string) => void): Promise<void> {
  await db.deleteEntry(id);
  navigate('/list?reload=true');
}