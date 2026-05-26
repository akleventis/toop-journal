import type { Cleanup } from '../router';
import { jsPDF } from 'jspdf';
import { S3Config, SyncState, HealthCheck } from '../../../shared/types';
import { networkManager } from '../../lib/network-manager';
import { handleError } from '../../lib/error-handler';
import { formatBytes, formatRelativeTime } from '../../lib/format';
import * as db from '../../db/db';
import { navigate } from '../router';
import { openModal } from '../components/modal';

export function mountMore(container: HTMLElement): Cleanup {
  container.replaceChildren();
  container.style.cssText = 'height:100%;overflow-y:auto';

  const inner = document.createElement('div');
  inner.className = 'flex flex-col gap-3 p-4 pb-4 max-w-[440px] mx-auto';

  const cleanups: (() => void)[] = [];

  const settingsLabel = sectionLabel('Settings');
  settingsLabel.style.marginTop = '4px';
  inner.appendChild(settingsLabel);

  const card1 = card();
  const pwCleanup = buildPassword(card1);
  if (pwCleanup) cleanups.push(pwCleanup);
  card1.appendChild(divider());
  const awsCleanup = buildAWS(card1);
  if (awsCleanup) cleanups.push(awsCleanup);
  inner.appendChild(card1);

  const card2 = card();
  buildEntryLimit(card2);
  card2.appendChild(divider());
  buildSearchLimit(card2);
  inner.appendChild(card2);

  const card3 = card();
  buildExport(card3);
  inner.appendChild(card3);

  const card4 = card();
  buildConflictsRow(card4);
  buildNavRow(card4, 'Logs', () => navigate('/logs'));
  buildNavRow(card4, 'Backups', () => navigate('/backups'));
  inner.appendChild(card4);

  const card5 = card();
  buildHealthCheck(card5);
  inner.appendChild(card5);

  container.appendChild(inner);

  return () => { for (const fn of cleanups) fn(); };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function card(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'card';
  return el;
}

function divider(): HTMLElement {
  const hr = document.createElement('hr');
  hr.className = 'setting-divider';
  return hr;
}

function sectionLabel(text: string): HTMLElement {
  const el = document.createElement('p');
  el.className = 'section-label';
  el.textContent = text;
  return el;
}

function toggle(active: boolean, onClick: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'toggle';
  el.style.background = active ? 'var(--color-accent)' : 'rgba(128,128,128,0.4)';
  const slider = document.createElement('div');
  slider.className = 'toggle-slider';
  slider.style.left = active ? '18px' : '2px';
  el.appendChild(slider);
  el.onclick = onClick;
  return el;
}

function setToggle(el: HTMLElement, active: boolean) {
  el.style.background = active ? 'var(--color-accent)' : 'rgba(128,128,128,0.4)';
  const slider = el.querySelector<HTMLElement>('.toggle-slider');
  if (slider) slider.style.left = active ? '18px' : '2px';
}

function navRow(label: string, onClick: () => void, badge?: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'nav-row';
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  el.appendChild(labelEl);
  const right = document.createElement('div');
  right.className = 'flex items-center gap-2';
  if (badge) {
    const badgeEl = document.createElement('span');
    badgeEl.style.cssText = 'font-size:10px;font-weight:600;padding:2px 8px;border-radius:9999px;color:white;background:var(--color-error)';
    badgeEl.textContent = String(badge);
    right.appendChild(badgeEl);
  }
  const arrow = document.createElement('span');
  arrow.className = 'text-muted';
  arrow.textContent = '›';
  right.appendChild(arrow);
  el.appendChild(right);
  el.onclick = onClick;
  return el;
}

// ─── Password ──────────────────────────────────────────────────────────────

function buildPassword(parent: HTMLElement): (() => void) | null {
  let passwordProtected = false;

  parent.appendChild(sectionLabel('Security'));

  const tog = toggle(false, handleToggle);
  const wrap = document.createElement('div');
  wrap.className = 'flex items-center justify-between';
  const span = document.createElement('span');
  span.style.fontSize = '13px';
  span.textContent = 'Password Protection';
  wrap.appendChild(span);
  wrap.appendChild(tog);
  parent.appendChild(wrap);

  const updateRow = () => setToggle(tog, passwordProtected);

  async function handleToggle() {
    if (passwordProtected) {
      await db.clearPasswordCredentials();
      const hash = await db.getPasswordHash();
      passwordProtected = !!hash;
      updateRow();
      return;
    }

    const content = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter new password';
    input.className = 'w-full';
    const btns = document.createElement('div');
    btns.className = 'flex gap-2 justify-end mt-1';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    const enableBtn = document.createElement('button');
    enableBtn.textContent = 'Enable';
    btns.appendChild(cancelBtn);
    btns.appendChild(enableBtn);
    content.appendChild(input);
    content.appendChild(btns);

    const close = openModal('Password Protection', () => content);
    setTimeout(() => input.focus(), 50);

    cancelBtn.onclick = close;
    enableBtn.onclick = async () => {
      const pw = input.value;
      if (!pw.trim()) return;
      try {
        const { hash, salt } = await window.security.hashPassword(pw);
        await db.setPasswordHash(hash);
        await db.setPasswordSalt(salt);
        passwordProtected = true;
        updateRow();
        close();
      } catch (error) {
        handleError(error, 'Error enabling password');
      }
    };
  }

  db.getPasswordHash().then(hash => { passwordProtected = !!hash; updateRow(); });
  return null;
}

// ─── AWS Config ────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: S3Config = { aws_access: '', aws_secret: '', aws_bucket: '', aws_region: '' };

function buildAWS(parent: HTMLElement): () => void {
  let awsConfig: S3Config | null = null;
  let syncState: SyncState = SyncState.UNINITIALIZED;
  let formData: S3Config = { ...DEFAULT_CONFIG };
  let confirmingDisable = false;

  parent.appendChild(sectionLabel('Cloud Sync'));

  const DOT_COLOR: Record<SyncState, string> = {
    [SyncState.READY]:         'var(--color-success)',
    [SyncState.SYNCING]:       'var(--color-warning)',
    [SyncState.INITIALIZING]:  'var(--color-warning)',
    [SyncState.ERROR]:         'var(--color-error)',
    [SyncState.OFFLINE]:       'var(--color-accent)',
    [SyncState.DISABLED]:      'var(--color-accent)',
    [SyncState.UNINITIALIZED]: 'var(--color-accent)',
  };

  const statusDot = document.createElement('div');
  statusDot.className = 'w-[5px] h-[5px] rounded-full';
  statusDot.style.background = DOT_COLOR[syncState];

  const labelWrap = document.createElement('div');
  labelWrap.className = 'flex items-center gap-2';
  const awsLabel = document.createElement('span');
  awsLabel.style.fontSize = '13px';
  awsLabel.textContent = 'AWS';
  labelWrap.appendChild(awsLabel);
  labelWrap.appendChild(statusDot);

  const rightWrap = document.createElement('div');
  rightWrap.className = 'flex items-center gap-2';

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit';
  editBtn.style.display = 'none';
  editBtn.onclick = () => openAWSModal();

  const syncBtn = document.createElement('button');
  syncBtn.textContent = 'Sync';
  syncBtn.style.display = 'none';
  syncBtn.onclick = handleSync;

  const tog = toggle(false, handleToggle);
  rightWrap.appendChild(editBtn);
  rightWrap.appendChild(syncBtn);
  rightWrap.appendChild(tog);

  const mainRow = document.createElement('div');
  mainRow.className = 'flex items-center justify-between';
  mainRow.appendChild(labelWrap);
  mainRow.appendChild(rightWrap);
  parent.appendChild(mainRow);

  const errorEl = document.createElement('p');
  errorEl.style.cssText = 'font-size:11px;margin-top:8px;margin-bottom:0;display:none';
  errorEl.className = 'text-error';
  errorEl.textContent = 'Sync error — check connection or credentials';
  parent.appendChild(errorEl);

  const disableConfirmEl = document.createElement('div');
  disableConfirmEl.style.cssText = 'display:none;gap:8px;justify-content:flex-end;margin-top:12px';
  parent.appendChild(disableConfirmEl);

  const update = () => {
    const isActive = syncState === SyncState.READY || syncState === SyncState.SYNCING;
    const isBusy = syncState === SyncState.SYNCING || syncState === SyncState.INITIALIZING;
    statusDot.style.background = DOT_COLOR[syncState];
    setToggle(tog, isActive);
    editBtn.style.display = awsConfig ? '' : 'none';
    syncBtn.style.display = awsConfig ? '' : 'none';
    syncBtn.disabled = isBusy;
    errorEl.style.display = syncState === SyncState.ERROR ? '' : 'none';
    disableConfirmEl.style.display = confirmingDisable ? 'flex' : 'none';
  };

  async function handleToggle() {
    const isActive = syncState === SyncState.READY || syncState === SyncState.SYNCING;
    if (!awsConfig) {
      if (!networkManager.isOnline()) { alert('Please connect to the internet to create an AWS config'); return; }
      openAWSModal();
    } else if (isActive) {
      confirmingDisable = true;
      buildDisableConfirm();
      update();
    } else {
      await window.cloudSync.initS3Client();
    }
  }

  const buildDisableConfirm = () => {
    disableConfirmEl.replaceChildren();
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => { confirmingDisable = false; update(); };
    const disableBtn = document.createElement('button');
    disableBtn.textContent = 'Disable';
    disableBtn.onclick = async () => { await window.cloudSync.disableSync(); confirmingDisable = false; update(); };
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete credentials';
    deleteBtn.onclick = async () => { await window.cloudSync.deleteConfig(); awsConfig = null; confirmingDisable = false; update(); };
    disableConfirmEl.appendChild(cancelBtn);
    disableConfirmEl.appendChild(disableBtn);
    disableConfirmEl.appendChild(deleteBtn);
  };

  async function handleSync() {
    const isActive = syncState === SyncState.READY || syncState === SyncState.SYNCING;
    const wasDisabled = !isActive;
    let succeeded = false;
    try {
      if (wasDisabled) await window.cloudSync.initS3Client();
      await window.cloudSync.cloudSyncPipeline();
      succeeded = true;
    } catch (_) { /* syncState transitions to 'error', shown inline */ }
    finally { if (wasDisabled && succeeded) await window.cloudSync.disableSync(); }
  }

  function openAWSModal() {
    const isEdit = awsConfig !== null;
    const content = document.createElement('div');
    content.className = 'flex flex-col gap-2';

    if (syncState === SyncState.ERROR) {
      const errMsg = document.createElement('p');
      errMsg.style.cssText = 'font-size:11px;text-align:center;margin:0';
      errMsg.className = 'text-error';
      errMsg.textContent = 'Failed — verify credentials and try again';
      content.appendChild(errMsg);
    }

    const accessInput = textInput('Access Key', formData.aws_access);
    const secretInput = textInput(isEdit ? 'Leave blank to keep current' : 'Secret Key', formData.aws_secret, 'password');
    const bucketInput = textInput('Bucket', formData.aws_bucket);
    const regionInput = textInput('Region', formData.aws_region);

    content.appendChild(accessInput);
    content.appendChild(secretInput);
    content.appendChild(bucketInput);
    content.appendChild(regionInput);

    const btns = document.createElement('div');
    btns.className = 'flex gap-2 justify-end mt-1';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    const saveBtn = document.createElement('button');
    saveBtn.textContent = syncState === SyncState.INITIALIZING ? 'Saving…' : 'Save';
    saveBtn.disabled = syncState === SyncState.INITIALIZING;
    btns.appendChild(cancelBtn);
    btns.appendChild(saveBtn);

    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-col gap-2';
    wrapper.appendChild(content);
    wrapper.appendChild(btns);

    const close = openModal('AWS Config', () => wrapper);

    cancelBtn.onclick = () => { formData = awsConfig ?? { ...DEFAULT_CONFIG }; close(); };
    saveBtn.onclick = async () => {
      formData = {
        aws_access: accessInput.value,
        aws_secret: secretInput.value,
        aws_bucket: bucketInput.value,
        aws_region: regionInput.value,
      };
      try {
        if (awsConfig) {
          await window.cloudSync.updateConfig(formData);
        } else {
          await window.cloudSync.createConfig(formData);
        }
        awsConfig = formData;
        close();
      } catch (_) { /* syncState transitions to 'error' */ }
    };
  }

  window.cloudSync.getConfig().then(config => {
    if (config) { awsConfig = config; formData = config; }
    update();
  });
  window.syncState.getState().then(s => { syncState = s; update(); });
  const unsubSync = window.syncState.onStateChange(s => { syncState = s; update(); });

  return unsubSync;
}

function textInput(placeholder: string, value: string, type = 'text'): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  input.placeholder = placeholder;
  input.value = value;
  return input;
}

// ─── Entry Limit ───────────────────────────────────────────────────────────

function buildEntryLimit(parent: HTMLElement) {
  parent.appendChild(sectionLabel('Entry Load Limit'));

  const wrap = document.createElement('div');
  wrap.className = 'flex gap-2 items-center';

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'flex-1';
  input.placeholder = 'All entries';
  input.value = localStorage.getItem('entryLimit') ?? '';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';

  saveBtn.onclick = () => {
    const trimmed = input.value.trim();
    if (!trimmed) {
      localStorage.removeItem('entryLimit');
    } else {
      const parsed = parseInt(trimmed, 10);
      if (isNaN(parsed) || parsed <= 0) { alert('Please enter a valid number'); return; }
      localStorage.setItem('entryLimit', trimmed);
    }
    saveBtn.textContent = 'Saved ✓';
    db.clearDecodedCache();
    setTimeout(() => navigate('/list', { reload: 'true' }), 500);
  };

  wrap.appendChild(input);
  wrap.appendChild(saveBtn);
  parent.appendChild(wrap);
}

// ─── Search Limit ──────────────────────────────────────────────────────────

function buildSearchLimit(parent: HTMLElement) {
  parent.appendChild(sectionLabel('Search Result Limit'));

  const wrap = document.createElement('div');
  wrap.className = 'flex gap-2 items-center';

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'flex-1';
  input.placeholder = 'All results';
  input.value = localStorage.getItem('searchLimit') ?? '';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';

  saveBtn.onclick = () => {
    const trimmed = input.value.trim();
    if (!trimmed) {
      localStorage.removeItem('searchLimit');
    } else {
      const parsed = parseInt(trimmed, 10);
      if (isNaN(parsed) || parsed <= 0) { alert('Please enter a valid number'); return; }
      localStorage.setItem('searchLimit', trimmed);
    }
    saveBtn.textContent = 'Saved ✓';
    setTimeout(() => { saveBtn.textContent = 'Save'; }, 2000);
  };

  wrap.appendChild(input);
  wrap.appendChild(saveBtn);
  parent.appendChild(wrap);
}

// ─── Export ────────────────────────────────────────────────────────────────

function buildExport(parent: HTMLElement) {
  parent.appendChild(sectionLabel('Export'));

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-2 gap-2';

  const startInput = dateInput(firstOfMonth.toLocaleDateString('en-CA'));
  const endInput = dateInput(today.toLocaleDateString('en-CA'));
  const formatSel = fmtSelect();
  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Export';

  grid.appendChild(labeledField('Start', startInput));
  grid.appendChild(labeledField('End', endInput));
  grid.appendChild(labeledField('Format', formatSel));
  const btnWrap = document.createElement('div');
  btnWrap.className = 'flex flex-col gap-1 justify-end';
  btnWrap.appendChild(exportBtn);
  grid.appendChild(btnWrap);
  parent.appendChild(grid);

  exportBtn.onclick = async () => {
    if (!startInput.value || !endInput.value) { alert('Please select start and end dates'); return; }
    exportBtn.textContent = 'Exporting…';
    exportBtn.disabled = true;
    try {
      const startTs = new Date(startInput.value + 'T00:00:00').getTime();
      const endTs = new Date(endInput.value + 'T23:59:59.999').getTime();
      const entries = await db.getEntriesBetweenTimestamps(startTs, endTs);
      if (entries.length === 0) { alert('No entries found in selected date range'); return; }

      const filename = `journal_export_${startInput.value}_${endInput.value}`;
      const fmt = formatSel.value;

      if (fmt === 'pdf') {
        const doc = new jsPDF({ unit: 'pt', format: 'letter' });
        const margin = 40;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const maxWidth = pageWidth - margin * 2;
        let y = margin;
        const checkY = (needed: number) => { if (y + needed > pageHeight - margin) { doc.addPage(); y = margin; } };
        for (const entry of entries) {
          doc.setFontSize(13); doc.setFont('helvetica', 'bold');
          checkY(20); doc.text(entry.date, margin, y); y += 18;
          if (entry.location) {
            doc.setFontSize(9); doc.setFont('helvetica', 'italic');
            checkY(14); doc.text(entry.location, margin, y); y += 14;
          }
          // Extract plain text from HTML for PDF rendering
          const tmp = document.createElement('div');
          tmp.innerHTML = entry.content; // nosec: trusted app data for text extraction
          const plainText = (tmp.textContent ?? '').trim();
          doc.setFontSize(10); doc.setFont('helvetica', 'normal');
          const lines = doc.splitTextToSize(plainText, maxWidth) as string[];
          for (const line of lines) { checkY(13); doc.text(line, margin, y); y += 13; }
          y += 12;
        }
        downloadBlob(doc.output('blob'), filename + '.pdf');
        return;
      }

      let content = '';
      const ext: Record<string, string> = { html: '.html', json: '.json', csv: '.csv', txt: '.txt', encoded_html: '.json' };
      switch (fmt) {
        case 'html':
          content = `<html><body>${entries.map(e => `<div><h3>${e.date}</h3>${e.content}</div><hr>`).join('')}</body></html>`;
          break;
        case 'json': content = JSON.stringify(entries, null, 2); break;
        case 'csv':
          content = 'Date,Location,Content\n' + entries.map(e =>
            `"${e.date}","${(e.location ?? '').replace(/"/g, '""')}","${e.content.replace(/"/g, '""')}"`
          ).join('\n');
          break;
        case 'txt':
          content = entries.map(e => `${e.date}\n${e.content}\n${e.location ?? ''}\n---\n`).join('\n');
          break;
        case 'encoded_html':
          content = JSON.stringify(entries.map(e => ({ id: e.id, date: e.date, location: e.location ?? '', content: e.content, timestamp: e.timestamp })), null, 2);
          break;
      }
      downloadBlob(new Blob([content], { type: 'text/plain' }), filename + (ext[fmt] ?? ''));
    } catch (error) {
      handleError(error, 'Export failed');
    } finally {
      exportBtn.textContent = 'Export';
      exportBtn.disabled = false;
    }
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function dateInput(value: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'date';
  input.value = value;
  return input;
}

function fmtSelect(): HTMLSelectElement {
  const sel = document.createElement('select');
  for (const [val, lbl] of [['html','HTML'],['json','JSON'],['csv','CSV'],['txt','TXT'],['encoded_html','Encoded HTML'],['pdf','PDF']] as [string,string][]) {
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = lbl;
    sel.appendChild(opt);
  }
  return sel;
}

function labeledField(labelText: string, input: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col gap-1';
  const label = document.createElement('label');
  label.style.cssText = 'font-size:10px;color:var(--text-muted)';
  label.textContent = labelText;
  wrap.appendChild(label);
  wrap.appendChild(input);
  return wrap;
}

// ─── Nav rows ──────────────────────────────────────────────────────────────

function buildConflictsRow(parent: HTMLElement) {
  window.conflicts.getConflictCount().then(count => {
    if (count === 0) return;
    parent.appendChild(navRow('Conflicts', () => navigate('/conflicts'), count));
  });
}

function buildNavRow(parent: HTMLElement, label: string, onClick: () => void) {
  parent.appendChild(navRow(label, onClick));
}

// ─── Health check ──────────────────────────────────────────────────────────

function buildHealthCheck(parent: HTMLElement) {
  parent.appendChild(sectionLabel('System Health'));

  const btnWrap = document.createElement('div');
  btnWrap.className = 'flex justify-center mb-3';
  const runBtn = document.createElement('button');
  runBtn.textContent = 'Run Health Check';
  btnWrap.appendChild(runBtn);
  parent.appendChild(btnWrap);

  const resultsEl = document.createElement('div');
  resultsEl.className = 'flex flex-col gap-2';
  parent.appendChild(resultsEl);

  runBtn.onclick = async () => {
    runBtn.textContent = 'Checking…';
    runBtn.disabled = true;
    try {
      const h: HealthCheck = await window.health.run();
      resultsEl.replaceChildren();
      const rows: [string, string, boolean][] = [
        ['Database', statusIcon(h.databaseIntegrity), false],
        ['Master Index', statusIcon(h.masterIndexIntegrity), false],
        ['S3 Connectivity', statusIcon(h.s3Connectivity), false],
        ['Disk Free', formatBytes(h.diskSpace), false],
        ['Last Sync', formatRelativeTime(h.lastSyncTime), true],
      ];
      for (const [label, value, muted] of rows) {
        const rowEl = document.createElement('div');
        rowEl.className = 'flex justify-between items-center text-[12px]';
        const labelEl = document.createElement('span');
        labelEl.className = 'text-muted';
        labelEl.textContent = label;
        const valueEl = document.createElement('span');
        valueEl.textContent = value;
        if (muted) valueEl.className = 'text-muted';
        rowEl.appendChild(labelEl);
        rowEl.appendChild(valueEl);
        resultsEl.appendChild(rowEl);
      }
    } catch (error) {
      handleError(error, 'Health check failed');
    } finally {
      runBtn.textContent = 'Run Health Check';
      runBtn.disabled = false;
    }
  };
}

function statusIcon(ok: boolean | null): string {
  if (ok === null) return 'N/A';
  return ok ? '✓' : '✗';
}
