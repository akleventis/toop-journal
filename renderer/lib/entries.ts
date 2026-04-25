import { Entry } from '../../shared/types';
import * as db from '../db/db';
import { formatCurrentDate, journalDateToId } from './dates';

// Creates or updates an entry from the WYSIWYG editor, then navigates to /list.
export async function saveEntry(
  currentHtml: string,
  entry: Entry | null,
  navigate: (path: string) => void,
  date?: string
): Promise<void> {
  if (currentHtml === '' || currentHtml === '<br>' || currentHtml === '<p><br></p>') {
    alert('empty! please enter thoughts');
    return;
  }

  let exists = false;
  if (entry) {
    exists = await db.getEntryById(entry.id) !== null;
  }

  if (exists && entry) {
    await db.updateEntry(entry.id, { content: currentHtml });
  } else {
    const entryDate = date ?? formatCurrentDate();
    const newEntry = {
      id: journalDateToId(entryDate),
      date: entryDate,
      content: currentHtml
    };
    await db.createEntry(newEntry);
  }
  navigate('/list?reload=true');
}

// Deletes an entry and navigates to /list.
export async function deleteEntry(id: string, navigate: (path: string) => void): Promise<void> {
  await db.deleteEntry(id);
  navigate('/list?reload=true');
}
