import type { Cleanup } from '../router';
import type { Entry } from '../../../shared/types';
import { NavDirection } from '../../lib/constants';
import { saveEntry } from '../../lib/entries';
import { setNavGuard, clearNavGuard } from '../../lib/nav-guard';
import { handleError } from '../../lib/error-handler';
import { QuillEditor } from '../components/quill-editor';
import * as db from '../../db/db';
import { navigate } from '../router';

export function mountEdit(container: HTMLElement, params: URLSearchParams): Cleanup {
  container.replaceChildren();

  const entryId = params.get('id');
  let entry: Entry | null = null;
  let isSaving = false;
  let isEditing = false;
  let currentHtml = '';
  let editor: QuillEditor | null = null;
  let saveBtn: HTMLButtonElement | null = null;

  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col';

  const dateLabel = document.createElement('div');
  dateLabel.className = 'text-center text-[12px] text-gray-400';
  wrap.appendChild(dateLabel);

  container.appendChild(wrap);

  const handleNavigate = async (direction: NavDirection) => {
    if (!entry) return;
    try {
      const adjacent = await db.getAdjacentEntry(entry.id, direction === NavDirection.PREV ? 'prev' : 'next');
      if (adjacent) navigate('/edit', { id: adjacent.id });
    } catch (error) {
      handleError(error);
    }
  };

  const showSaveBtn = () => {
    if (saveBtn) return;
    saveBtn = document.createElement('button');
    saveBtn.className = 'px-2 py-1 text-[12px]';
    saveBtn.textContent = 'Done';
    saveBtn.style.cssText = 'position:fixed;bottom:0;right:0;margin:0 10px 10px 0';
    saveBtn.onclick = async () => {
      if (isSaving) return;
      isSaving = true;
      saveBtn!.textContent = 'Saving...';
      saveBtn!.disabled = true;
      try {
        await saveEntry(currentHtml, entry);
      } catch (error) {
        handleError(error);
      } finally {
        isSaving = false;
        if (saveBtn) {
          saveBtn.textContent = 'Done';
          saveBtn.disabled = false;
        }
      }
    };
    container.appendChild(saveBtn);
  };

  const hideSaveBtn = () => {
    saveBtn?.remove();
    saveBtn = null;
  };

  const init = async () => {
    if (!entryId) { navigate('/list'); return; }
    try {
      entry = await db.getEntryById(entryId);
      if (!entry) return;
      dateLabel.textContent = entry.date;

      editor = new QuillEditor({
        displayNav: true,
        editable: false,
        entry,
        onNavigate: handleNavigate,
        onEditModeChange: (editing) => {
          isEditing = editing;
          if (editing) {
            showSaveBtn();
          } else {
            hideSaveBtn();
          }
        },
        onContentChange: (html) => {
          currentHtml = html;
          const hasChanges = isEditing && html !== (entry?.content ?? '');
          hasChanges
            ? setNavGuard(() => window.confirm('You have unsaved changes. Leave anyway?'))
            : clearNavGuard();
        },
      });
      wrap.appendChild(editor.el);
    } catch (error) {
      handleError(error);
    }
  };

  init();

  return () => {
    clearNavGuard();
    hideSaveBtn();
    editor?.destroy();
  };
}
