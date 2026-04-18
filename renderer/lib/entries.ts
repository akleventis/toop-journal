import { Entry } from '../../shared/types';
import * as db from '../db/db';
import { htmlToMarkdown } from './markdown';
import { formatCurrentDate, journalDateToId } from './dates';

/**
 * Saves an entry to the database (creates or updates), then navigates to /list.
 */
export async function saveEntry(
  currentHtml: string,
  entry: Entry | null,
  navigate: (path: string) => void
): Promise<void> {
  if (currentHtml === '' || currentHtml === '<br>' || currentHtml === '<p><br></p>') {
    alert('empty! please enter thoughts');
    return;
  }

  const markdown = htmlToMarkdown(currentHtml);

  let exists = false;
  if (entry) {
    exists = await db.getEntryById(entry.id) !== null;
  }

  if (exists && entry) {
    await db.updateEntry(entry.id, { content: markdown });
  } else {
    const entryDate = formatCurrentDate();
    const newEntry = {
      id: journalDateToId(entryDate),
      date: entryDate,
      content: markdown
    };
    await db.createEntry(newEntry);
  }
  navigate('/list?reload=true');
}

/**
 * Deletes an entry from the database, then navigates to /list.
 */
export async function deleteEntry(id: string, navigate: (path: string) => void): Promise<void> {
  await db.deleteEntry(id);
  navigate('/list?reload=true');
}
