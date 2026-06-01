import { Entry } from '../../shared/types';
import * as db from '../db/db';
import { formatCurrentDate, journalDateToId, withCurrentTime } from './dates';
import { clearNavGuard } from './nav-guard';
import { navigate } from '../src/router';
import { alertModal } from '../src/components/modal';

export async function saveEntry(
  currentHtml: string,
  entry: Entry | null,
  date?: string
): Promise<void> {
  if (currentHtml === '' || currentHtml === '<br>' || currentHtml === '<p><br></p>') {
    alertModal('empty! please enter thoughts');
    return;
  }

  if (entry) {
    await db.updateEntry(entry.id, { content: currentHtml, date: withCurrentTime(entry.date) });
  } else {
    const entryDate = date ?? formatCurrentDate();
    const newEntry = {
      id: journalDateToId(entryDate),
      date: entryDate,
      content: currentHtml
    };
    await db.createEntry(newEntry);
  }
  clearNavGuard();
  navigate('/list', { reload: 'true' });
}

export async function deleteEntry(id: string): Promise<void> {
  await db.deleteEntry(id);
  clearNavGuard();
  navigate('/list', { reload: 'true' });
}
