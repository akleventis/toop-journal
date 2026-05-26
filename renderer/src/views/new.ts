import type { Cleanup } from '../router';
import { formatCurrentDate, calendarToJournal, journalToCalendar, getCurrentCalendarDate } from '../../lib/dates';
import { saveEntry } from '../../lib/entries';
import { setNavGuard, clearNavGuard } from '../../lib/nav-guard';
import { handleError } from '../../lib/error-handler';
import { QuillEditor } from '../components/quill-editor';
import * as db from '../../db/db';
import { navigate } from '../router';

export function mountNew(container: HTMLElement, params: URLSearchParams): Cleanup {
  container.replaceChildren();

  const dateParam = params.get('date');
  const entryDate = dateParam ? calendarToJournal(dateParam) : formatCurrentDate();

  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col';

  const dateLabel = document.createElement('div');
  dateLabel.className = 'text-center text-[12px] text-gray-400';
  dateLabel.textContent = entryDate;
  wrap.appendChild(dateLabel);

  container.appendChild(wrap);

  let isSaving = false;
  let currentHtml = '';

  const editor = new QuillEditor({
    displayNav: false,
    editable: true,
    entry: null,
    onContentChange: (html) => {
      currentHtml = html;
      const empty = !html || html === '<br>' || html === '<p><br></p>';
      empty ? clearNavGuard() : setNavGuard(() => window.confirm('You have unsaved changes. Leave anyway?'));
    },
  });
  wrap.appendChild(editor.el);
  editor.focus();

  const saveBtn = document.createElement('button');
  saveBtn.className = 'px-2 py-1 text-[12px]';
  saveBtn.textContent = 'Done';
  saveBtn.style.cssText = 'position:fixed;bottom:0;right:0;margin:0 10px 10px 0';
  saveBtn.onclick = async () => {
    if (isSaving) return;
    isSaving = true;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    try {
      await saveEntry(currentHtml, null, entryDate);
    } catch (error) {
      handleError(error);
    } finally {
      isSaving = false;
      saveBtn.textContent = 'Done';
      saveBtn.disabled = false;
    }
  };
  container.appendChild(saveBtn);

  // Redirect to today's edit if entry already exists (only when no specific date requested)
  if (!dateParam) {
    db.getMostRecentEntry().then(entry => {
      if (entry && journalToCalendar(entry.date) === getCurrentCalendarDate()) {
        navigate('/edit', { id: entry.id });
      }
    }).catch(handleError);
  }

  return () => {
    clearNavGuard();
    editor.destroy();
  };
}
