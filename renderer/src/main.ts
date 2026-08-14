import * as db from '../db/db';
import { handleError } from '../lib/error-handler';

import { journalDateToId, formatCurrentDate } from '../lib/dates';
import { networkManager } from '../lib/network-manager';
import { SyncState } from '../../shared/types';
import { initNavBar, updateNavBarActive } from './components/navbar';
import { showPasswordOverlay } from './components/password-overlay';
import { initListView, updateListEntries, updateListState, setLoadingMore, getLoadedLimit } from './views/list';
import { mountNew } from './views/new';
import { mountEdit } from './views/edit';
import { mountCalendar } from './views/calendar';
import { mountMore } from './views/more';
import { mountLogs } from './views/logs';
import { mountBackups } from './views/backups';
import { registerRoutes, initRouter, navigate, handleRoute, onRouteChange } from './router';

let zoom = 1;
document.addEventListener('keydown', (e) => {
  if (!e.metaKey && !e.ctrlKey) return;
  if (e.key === '+') zoom = parseFloat((zoom + 0.1).toFixed(1));
  else if (e.key === '-') zoom = parseFloat((zoom - 0.1).toFixed(1));
  else return;
  e.preventDefault();
  document.documentElement.style.zoom = String(zoom);
});

function logLineColor(line: string): string {
  if (line.includes('[SHUTDOWN]')) return '#fb923c';
  if (line.includes('[ERROR]')) return '#f87171';
  if (line.includes('[WARN]'))  return '#facc15';
  if (line.includes('[DEBUG]')) return '#6b7280';
  return '#d1d5db';
}

function buildStartupOverlay() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;padding:12px;font-family:monospace;font-size:11px;line-height:1.6;background:var(--color-app-bg);';
  const appendLine = (line: string) => {
    const div = document.createElement('div');
    div.style.color = logLineColor(line);
    div.textContent = line;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  };
  return { el, appendLine, remove: () => el.remove() };
}

function waitForSyncSettled(): Promise<SyncState> {
  return new Promise((resolve) => {
    const settled = (s: SyncState) =>
      s === SyncState.READY || s === SyncState.DISABLED || s === SyncState.ERROR;
    const check = (s: SyncState) => { if (settled(s)) { cleanup(); resolve(s); } };
    const cleanup = window.syncState.onStateChange(check);
    window.syncState.getState().then(check);
  });
}

async function init() {
  const root = document.getElementById('root')!;

  // ── Startup sync (if S3 configured) ──────────────────────────────────────
  const s3Config = await window.cloudSync.getConfig();
  if (s3Config) {
    const overlay = buildStartupOverlay();
    document.body.appendChild(overlay.el);

    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip Sync';
    skipBtn.style.cssText = 'position:sticky;bottom:8px;float:right;margin-top:12px;padding:4px 12px;font-family:monospace;font-size:11px;background:#1f2937;color:#6b7280;border:1px solid #374151;border-radius:4px;cursor:pointer';
    overlay.el.appendChild(skipBtn);

    let skipResolve!: () => void;
    const skipPromise = new Promise<void>(res => { skipResolve = res; });
    skipBtn.addEventListener('click', () => skipResolve());

    const recentLines = await window.logs.getRecent();
    recentLines.forEach(overlay.appendLine);
    const cleanupLogs = window.logs.onLine(overlay.appendLine);

    try {
      const settled = await Promise.race([
        waitForSyncSettled(),
        skipPromise.then(() => null),
      ]);
      if (settled !== null && settled === SyncState.READY && networkManager.isOnline()) {
        // late errors handled by .catch; race lets user skip or auto-timeout
        const syncPromise = window.cloudSync.cloudSyncPipeline().catch((err: unknown) => handleError(err));
        await Promise.race([
          syncPromise,
          skipPromise,
          new Promise<void>(res => setTimeout(res, 40_000)),
        ]);
      }
    } catch (err) {
      handleError(err);
    } finally {
      cleanupLogs();
      overlay.remove();
    }
  }

  // Track entriesChanged events that fire before the handler is wired up
  let pendingEntriesChanged = false;
  const cleanupEarlyListener = window.sqlite.onEntriesChanged(() => { pendingEntriesChanged = true; });

  // ── Password gate ─────────────────────────────────────────────────────────
  const hash = await db.getPasswordHash();
  if (hash) {
    root.style.cssText = 'height:100%';
    await showPasswordOverlay(root);
  }

  // ── Build app shell ───────────────────────────────────────────────────────
  const appShell = document.createElement('div');
  appShell.style.cssText = 'height:100%;display:flex;flex-direction:column';

  const navbarContainer = document.createElement('div');
  appShell.appendChild(navbarContainer);

  const content = document.createElement('div');
  content.style.cssText = 'flex:1;min-height:0;position:relative;overflow:hidden';
  appShell.appendChild(content);

  const viewList = document.createElement('div');
  viewList.id = 'view-list';
  viewList.style.cssText = 'display:none;height:100%';
  content.appendChild(viewList);

  const viewMain = document.createElement('div');
  viewMain.id = 'view-main';
  viewMain.style.cssText = 'display:none;height:100%;overflow-y:auto';
  content.appendChild(viewMain);

  root.replaceChildren(appShell);

  // ── Maintenance toast ─────────────────────────────────────────────────────
  const maintenanceToast = document.createElement('div');
  maintenanceToast.textContent = 'Optimizing database...';
  maintenanceToast.style.cssText = 'display:none;position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:9999;pointer-events:none';
  maintenanceToast.className = 'bg-surface text-muted text-xs px-3 py-1 rounded-full shadow';
  document.body.appendChild(maintenanceToast);
  window.maintenance.onStatus((running) => {
    maintenanceToast.style.display = running ? 'block' : 'none';
  });

  // ── Navbar ────────────────────────────────────────────────────────────────
  initNavBar(navbarContainer);
  onRouteChange((path) => {
    const isListRoute = path === '/list';
    viewList.style.display = isListRoute ? 'flex' : 'none';
    viewMain.style.display = isListRoute ? 'none' : '';
    updateNavBarActive(path);
  });

  // ── List view (always mounted) ────────────────────────────────────────────
  initListView(viewList);
  viewList.style.display = 'none'; // initListView overwrites cssText; restore until router shows it

  // ── Load initial entries ──────────────────────────────────────────────────
  const limit = db.getEntryLimitFromStorage();
  const [listEntries, calEntries] = await Promise.all([
    db.getEntriesForList(limit),
    db.getEntriesForCalendar(),
  ]);
  let calendarEntries = calEntries;

  const handleLoadMore = async () => {
    const perPage = db.getEntryLimitFromStorage();
    if (perPage == null) return;
    const currentLimit = getLoadedLimit();
    const nextLimit = (currentLimit ?? perPage) * 2;
    setLoadingMore(true);
    try {
      const more = await db.getEntriesForList(nextLimit);
      updateListEntries(more, nextLimit);
    } catch (error) {
      handleError(error);
    } finally {
      setLoadingMore(false);
    }
  };

  updateListState(listEntries, limit, handleLoadMore);

  // ── Refresh list entries (local writes + sync) ────────────────────────────
  const refreshEntries = async () => {
    db.clearDecodedCache();
    const [updated, cal] = await Promise.all([
      db.getEntriesForList(getLoadedLimit()),
      db.getEntriesForCalendar(),
    ]);
    calendarEntries = cal;
    updateListEntries(updated);
  };

  cleanupEarlyListener();
  if (pendingEntriesChanged) refreshEntries().catch(handleError);
  window.sqlite.onEntriesChanged(async () => {
    try { await refreshEntries(); } catch (error) { handleError(error); }
  });

  // ── Network reconnect sync ────────────────────────────────────────────────
  networkManager.subscribe((online: boolean) => {
    if (online) {
      window.syncState.getState().then((state: SyncState) => {
        if (state === SyncState.READY) window.cloudSync.cloudSyncPipeline().catch(handleError);
      });
    }
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  registerRoutes({
    '/': (params) => {
      // Handled by onRouteChange showing viewList; decide /list vs /new
      db.getEntryById(journalDateToId(formatCurrentDate())).then(entry => {
        navigate(entry ? '/list' : '/new');
      }).catch(handleError);
    },
    '/list': () => {
      viewMain.replaceChildren(); // list only hides #view-main — a hidden Quill still holds the caret and re-arms the nav guard
      Promise.all([
        db.getEntriesForList(getLoadedLimit()),
        db.getEntriesForCalendar(),
      ]).then(([entries, cal]) => {
        calendarEntries = cal;
        updateListEntries(entries);
      }).catch(handleError);
    },
    '/new': (params) => mountNew(viewMain, params),
    '/edit': (params) => mountEdit(viewMain, params),
    '/calendar': () => mountCalendar(viewMain, calendarEntries),
    '/more': () => mountMore(viewMain),
    '/logs': () => mountLogs(viewMain),
    '/backups': () => mountBackups(viewMain),
  });

  initRouter();

  // ── Teardown log overlay ──────────────────────────────────────────────────
  window.appState.onQuitting(async () => {
    const overlay = buildStartupOverlay();
    document.body.appendChild(overlay.el);
    const recentLines = await window.logs.getRecent();
    recentLines.forEach(overlay.appendLine);
    window.logs.onLine(overlay.appendLine);
  });

  // ── Initial route ─────────────────────────────────────────────────────────
  handleRoute();
}

init().catch((err) => {
  handleError(err);
  document.getElementById('root')!.textContent = 'Failed to start. Please reload.';
});
