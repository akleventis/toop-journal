import type { Cleanup } from '../router';
import type { Entry } from '../../../shared/types';
import { NavDirection } from '../../lib/constants';
import { saveEntry } from '../../lib/entries';
import { setNavGuard, clearNavGuard } from '../../lib/nav-guard';
import { handleError } from '../../lib/error-handler';
import { QuillEditor } from '../components/quill-editor';
import { confirmModal } from '../components/modal';
import * as db from '../../db/db';
import { navigate } from '../router';

export function mountEdit(container: HTMLElement, params: URLSearchParams): Cleanup {
  container.replaceChildren();

  const entryId = params.get('id');
  let entry: Entry | null = null;
  let disposed = false;
  let isSaving = false;
  let isEditing = false;
  let currentHtml = '';
  let baseline: string | null = null;
  let editor: QuillEditor | null = null;
  let saveBtn: HTMLButtonElement | null = null;
  let footer: HTMLDivElement | null = null;

  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col h-full';

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
    footer = document.createElement('div');
    footer.className = 'flex justify-end px-2.5 py-2';
    saveBtn = document.createElement('button');
    saveBtn.className = 'px-2 py-1 text-[12px]';
    saveBtn.textContent = 'Done';
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
    footer.appendChild(saveBtn);
    wrap.appendChild(footer);
  };

  const hideSaveBtn = () => {
    footer?.remove();
    footer = null;
    saveBtn = null;
  };

  const init = async () => {
    if (!entryId) { navigate('/list'); return; }
    try {
      entry = await db.getEntryById(entryId);
      // cleanup may have run while the fetch was in flight — building the editor now would strand it with unremovable document listeners
      if (!entry || disposed) return;
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
          if (baseline === null) { baseline = html; return; }
          const hasChanges = isEditing && html !== baseline;
          hasChanges
            ? setNavGuard(() => confirmModal('You have unsaved changes. Leave without saving?'))
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
    disposed = true;
    clearNavGuard();
    hideSaveBtn();
    editor?.destroy();
    editor = null;
  };
}
