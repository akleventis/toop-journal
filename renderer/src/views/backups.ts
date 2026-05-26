import type { Cleanup } from '../router';
import type { BackupInfo } from '../../../shared/types';
import { handleError } from '../../lib/error-handler';
import { formatBytes } from '../../lib/format';
import { openModal } from '../components/modal';

export function mountBackups(container: HTMLElement): Cleanup {
  container.replaceChildren();
  const wrap = document.createElement('div');
  wrap.style.padding = '20px';

  const h2 = document.createElement('h2');
  h2.style.cssText = 'text-align:center;font-size:13px;margin:0 0 15px 0';
  h2.textContent = 'Database Backups';
  wrap.appendChild(h2);

  const list = document.createElement('div');
  list.className = 'flex flex-col gap-[6px]';
  wrap.appendChild(list);

  container.appendChild(wrap);

  const renderBackups = (backups: BackupInfo[]) => {
    list.replaceChildren();
    if (backups.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'text-align:center;font-size:11px;color:#9ca3af';
      empty.textContent = 'No backups yet';
      list.appendChild(empty);
      return;
    }
    for (const b of backups) {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between px-3 py-2 rounded bg-surface';

      const info = document.createElement('div');
      const dateEl = document.createElement('div');
      dateEl.style.fontSize = '12px';
      dateEl.textContent = b.date;
      const sizeEl = document.createElement('div');
      sizeEl.style.cssText = 'font-size:10px;color:#9ca3af';
      sizeEl.textContent = formatBytes(b.sizeBytes);
      info.appendChild(dateEl);
      info.appendChild(sizeEl);

      const restoreBtn = document.createElement('button');
      restoreBtn.style.fontSize = '11px';
      restoreBtn.textContent = 'Restore';
      restoreBtn.onclick = () => confirmRestore(b);

      row.appendChild(info);
      row.appendChild(restoreBtn);
      list.appendChild(row);
    }
  };

  const confirmRestore = (b: BackupInfo) => {
    const content = document.createElement('div');
    content.style.textAlign = 'center';

    const warning = document.createElement('p');
    warning.style.cssText = 'font-size:11px;margin-bottom:10px';
    warning.className = 'text-error';
    const strong = document.createElement('strong');
    strong.textContent = b.date;
    warning.append('This will replace your entire database with the backup from ', strong, ' and restart the app.');

    const note = document.createElement('p');
    note.style.cssText = 'font-size:11px;color:#9ca3af;margin-bottom:15px';
    note.textContent = 'Any entries made after this date will be lost.';

    const btns = document.createElement('div');
    btns.className = 'flex gap-[10px] justify-center';

    const close = openModal('Restore Backup', () => content);

    const cancelBtn = document.createElement('button');
    cancelBtn.style.fontSize = '11px';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = close;

    const confirmBtn = document.createElement('button');
    confirmBtn.style.cssText = 'font-size:11px;background:var(--color-error);color:white';
    confirmBtn.textContent = 'Yes, restore and restart';
    confirmBtn.onclick = async () => {
      try {
        await window.backup.restore(b.filename);
      } catch (error) {
        handleError(error, 'Restore failed');
        close();
      }
    };

    btns.appendChild(cancelBtn);
    btns.appendChild(confirmBtn);
    content.appendChild(warning);
    content.appendChild(note);
    content.appendChild(btns);
  };

  window.backup.list().then(renderBackups).catch(handleError);

  return () => {};
}
