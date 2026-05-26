import type { Cleanup } from '../router';
import type { Conflict } from '../../../shared/types';
import { handleError } from '../../lib/error-handler';
import { navigate } from '../router';

export function mountConflicts(container: HTMLElement): Cleanup {
  container.replaceChildren();

  let conflicts: Conflict[] = [];
  let selected: Conflict | null = null;
  let version: 'local' | 'remote' = 'local';
  let loading = false;

  const root = document.createElement('div');
  root.style.cssText = 'height:100%';
  container.appendChild(root);

  const render = () => {
    root.replaceChildren();
    if (selected) renderDetail(root);
    else renderList(root);
  };

  const renderList = (parent: HTMLElement) => {
    const wrap = document.createElement('div');
    wrap.style.padding = '20px';

    const h2 = document.createElement('h2');
    h2.style.cssText = 'font-size:14px;margin:0 0 10px 0';
    h2.textContent = `Conflicts (${conflicts.length})`;
    wrap.appendChild(h2);

    for (const c of conflicts) {
      const row = document.createElement('div');
      row.style.cssText = 'padding:10px;margin-bottom:8px;border-radius:4px;cursor:pointer';
      row.className = 'bg-surface';
      const dateEl = document.createElement('div');
      dateEl.textContent = c.entryDate;
      row.appendChild(dateEl);
      row.onclick = () => { selected = c; render(); };
      wrap.appendChild(row);
    }

    const backBtn = document.createElement('button');
    backBtn.textContent = 'Back';
    backBtn.onclick = () => navigate('/list', { reload: 'true' });
    wrap.appendChild(backBtn);

    parent.appendChild(wrap);
  };

  const renderDetail = (parent: HTMLElement) => {
    if (!selected) return;
    const c = selected;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:20px;height:100%;display:flex;flex-direction:column';

    const h3 = document.createElement('h3');
    h3.style.cssText = 'font-size:14px;margin:0 0 10px 0';
    h3.className = 'text-error';
    h3.textContent = c.entryDate;
    wrap.appendChild(h3);

    const cols = document.createElement('div');
    cols.style.cssText = 'display:flex;gap:10px;flex:1;overflow:hidden';

    for (const v of ['local', 'remote'] as const) {
      const col = document.createElement('div');
      col.style.cssText = `flex:1;border-radius:4px;padding:10px;cursor:pointer;overflow:hidden;display:flex;flex-direction:column;${version === v ? 'border:2px solid currentColor' : 'border:1px solid var(--color-third-bg)'}`;
      col.className = version === v ? 'bg-raised' : 'bg-surface';

      const label = document.createElement('div');
      label.style.cssText = 'font-size:12px;font-weight:bold;margin-bottom:8px';
      label.textContent = `${v === 'local' ? 'Local' : 'Remote'}${version === v ? ' ✓' : ''}`;

      const preview = document.createElement('div');
      preview.style.cssText = 'flex:1;overflow:auto;font-size:11px;padding:8px;border-radius:4px;background:var(--color-app-bg)';
      // Conflict content is HTML from this app's own sync pipeline — trusted
      const versionHtml = v === 'local' ? c.localVersion : c.remoteVersion;
      preview.innerHTML = versionHtml; // nosec: trusted app-generated HTML

      col.appendChild(label);
      col.appendChild(preview);
      col.onclick = () => { version = v; render(); };
      cols.appendChild(col);
    }
    wrap.appendChild(cols);

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px';

    const backBtn = document.createElement('button');
    backBtn.textContent = 'Back';
    backBtn.disabled = loading;
    backBtn.onclick = () => { selected = null; render(); };

    const resolveBtn = document.createElement('button');
    resolveBtn.textContent = loading ? 'Resolving...' : 'Keep Selected';
    resolveBtn.disabled = loading;
    resolveBtn.onclick = async () => {
      if (!selected) return;
      loading = true;
      render();
      try {
        await window.conflicts.resolveConflict(c.entryId, version);
        navigate('/list', { reload: 'true' });
      } catch (error) {
        handleError(error, 'Failed to resolve conflict');
        loading = false;
        render();
      }
    };

    footer.appendChild(backBtn);
    footer.appendChild(resolveBtn);
    wrap.appendChild(footer);
    parent.appendChild(wrap);
  };

  window.conflicts.getConflicts().then(data => {
    conflicts = data;
    if (data.length === 0) {
      navigate('/list', { reload: 'true' });
    } else {
      render();
    }
  });

  return () => {};
}
