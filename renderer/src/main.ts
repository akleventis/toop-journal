import * as db from '../db/db';
import { handleError } from '../lib/error-handler';

// Apply saved zoom immediately so layout is correct before first paint
document.documentElement.style.zoom = localStorage.getItem('zoom') ?? '1';

document.addEventListener('keydown', (e) => {
  if (!e.metaKey && !e.ctrlKey) return;
  const current = parseFloat(localStorage.getItem('zoom') ?? '1');
  let next: number | null = null;
  if (e.key === '=' || e.key === '+') next = Math.min(2.0, parseFloat((current + 0.1).toFixed(1)));
  else if (e.key === '-') next = Math.max(0.5, parseFloat((current - 0.1).toFixed(1)));
  else if (e.key === '0') next = 1.0;
  else return;
  e.preventDefault();
  document.documentElement.style.zoom = String(next);
  localStorage.setItem('zoom', String(next));
});
import { journalToCalendar, getCurrentCalendarDate } from '../lib/dates';
import { networkManager } from '../lib/network-manager';
import { initNavBar, updateNavBarActive } from './components/navbar';
import { showPasswordOverlay } from './components/password-overlay';
import { initListView, updateListEntries, updateListState, setLoadingMore, getLoadedLimit } from './views/list';
import { mountNew } from './views/new';
import { mountEdit } from './views/edit';
import { mountCalendar } from './views/calendar';
import { mountMore } from './views/more';
import { mountConflicts } from './views/conflicts';
import { mountLogs } from './views/logs';
import { mountBackups } from './views/backups';
import { registerRoutes, initRouter, navigate, handleRoute, onRouteChange } from './router';

async function init() {
  const root = document.getElementById('root')!;

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
  const loadEntries = async () => {
    const limit = db.getEntryLimitFromStorage();
    const [listEntries, calEntries] = await Promise.all([
      db.getEntriesForList(limit),
      db.getEntriesForCalendar(),
    ]);
    return { listEntries, calEntries, limit };
  };

  let calendarEntries: Awaited<ReturnType<typeof loadEntries>>['calEntries'] = [];

  const { listEntries, calEntries, limit } = await loadEntries();
  calendarEntries = calEntries;

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

  // ── Silent reload when sync pipeline pushes remote entries ────────────────
  window.sqlite.onEntriesChanged(async () => {
    try {
      const [updated, cal] = await Promise.all([
        db.getEntriesForList(getLoadedLimit()),
        db.getEntriesForCalendar(),
      ]);
      calendarEntries = cal;
      updateListEntries(updated);
    } catch (error) {
      handleError(error);
    }
  });

  // ── Network sync ──────────────────────────────────────────────────────────
  const trySync = async () => {
    if (!networkManager.isOnline()) return;
    try {
      await window.cloudSync.initS3Client();
      await window.cloudSync.cloudSyncPipeline();
    } catch (err) {
      handleError(err);
    }
  };
  networkManager.subscribe((online) => { if (online) trySync(); });
  trySync();

  // ── Routes ────────────────────────────────────────────────────────────────
  registerRoutes({
    '/': (params) => {
      // Handled by onRouteChange showing viewList; decide /list vs /new
      db.getMostRecentEntry().then(entry => {
        const hasToday = entry && journalToCalendar(entry.date) === getCurrentCalendarDate();
        navigate(hasToday ? '/list' : '/new');
      }).catch(handleError);
    },
    '/list': (params) => {
      const reload = params.get('reload') === 'true';
      if (reload) {
        Promise.all([
          db.getEntriesForList(getLoadedLimit()),
          db.getEntriesForCalendar(),
        ]).then(([entries, cal]) => {
          calendarEntries = cal;
          updateListEntries(entries);
        }).catch(handleError);
      }
    },
    '/new': (params) => mountNew(viewMain, params),
    '/edit': (params) => mountEdit(viewMain, params),
    '/calendar': () => mountCalendar(viewMain, calendarEntries),
    '/more': () => mountMore(viewMain),
    '/conflicts': () => mountConflicts(viewMain),
    '/logs': () => mountLogs(viewMain),
    '/backups': () => mountBackups(viewMain),
  });

  initRouter();

  // ── Initial route ─────────────────────────────────────────────────────────
  if (!window.location.hash || window.location.hash === '#/') {
    const mostRecent = await db.getMostRecentEntry();
    const hasToday = mostRecent && journalToCalendar(mostRecent.date) === getCurrentCalendarDate();
    navigate(hasToday ? '/list' : '/new');
  } else {
    handleRoute();
  }
}

init().catch((err) => {
  console.error('App init failed', err);
  document.getElementById('root')!.textContent = 'Failed to start. Please reload.';
});
