import type { Entry } from '../../../shared/types';
import { getDateParts } from '../../lib/dates';
import { handleError } from '../../lib/error-handler';
import * as db from '../../db/db';
import { navigate } from '../router';

// Module-level state — persists across navigations since list is always mounted
let entries: Entry[] = [];
let loadedLimit: number | undefined;
let hasMore = false;
let loadingMore = false;
let searchResults: Entry[] | null = null;
let searchValue = '';
let activeQuery = '';
let isSearching = false;
let hasMoreSearch = false;
let searchPage = 1;
let onLoadMoreCb: (() => Promise<void>) | null = null;

// DOM refs
let scrollEl: HTMLElement;
let itemsEl: HTMLElement;
let searchInput: HTMLInputElement;
let statusEl: HTMLElement;
let loadMoreSearchBtn: HTMLButtonElement;
let clearSearchBtn: HTMLButtonElement;
let loadMoreBtn: HTMLButtonElement;

export function initListView(container: HTMLElement) {
  container.style.cssText = 'height:100%;display:flex;flex-direction:column;overflow-x:hidden';

  scrollEl = document.createElement('div');
  scrollEl.style.cssText = 'flex:1;min-height:0;overflow-y:auto;overflow-x:hidden';

  itemsEl = document.createElement('div');
  scrollEl.appendChild(itemsEl);

  // Event delegation — one listener for all rows
  itemsEl.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-entry-id]');
    if (row?.dataset.entryId) navigate('/edit', { id: row.dataset.entryId });
  });

  const footer = document.createElement('div');
  footer.style.cssText = 'padding:2px;display:flex;align-items:center;gap:6px;width:100%;height:30px;flex-shrink:0;background:var(--color-app-bg)';

  searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search';
  searchInput.style.cssText = 'padding:2px;margin-left:2px;font-size:10px;height:20px;outline:none;background:transparent;border:none';
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSearch(); });
  searchInput.addEventListener('input', () => {
    searchValue = searchInput.value;
    if (!searchValue) handleClearSearch();
    clearSearchBtn.style.display = searchValue ? '' : 'none';
  });

  statusEl = document.createElement('span');
  statusEl.style.cssText = 'font-size:10px;color:#9ca3af';

  loadMoreSearchBtn = document.createElement('button');
  loadMoreSearchBtn.style.cssText = 'font-size:10px;height:20px;padding:0 8px;display:none';
  loadMoreSearchBtn.textContent = 'Load more';
  loadMoreSearchBtn.onclick = handleLoadMoreSearch;

  clearSearchBtn = document.createElement('button');
  clearSearchBtn.style.cssText = 'font-size:10px;height:20px;padding:0 8px;display:none';
  clearSearchBtn.textContent = 'Clear';
  clearSearchBtn.onclick = handleClearSearch;

  loadMoreBtn = document.createElement('button');
  loadMoreBtn.style.cssText = 'font-size:10px;height:20px;padding:0 8px;display:none;margin-left:auto;margin-right:4px;color:var(--text-muted)';
  loadMoreBtn.onclick = async () => {
    if (loadingMore || !onLoadMoreCb) return;
    onLoadMoreCb();
  };

  footer.appendChild(searchInput);
  footer.appendChild(statusEl);
  footer.appendChild(loadMoreSearchBtn);
  footer.appendChild(clearSearchBtn);
  footer.appendChild(loadMoreBtn);

  container.appendChild(scrollEl);
  container.appendChild(footer);

  scrollEl.addEventListener('scroll', updateLoadMoreVisibility, { passive: true });
}

export function updateListState(
  newEntries: Entry[],
  limit: number | undefined,
  loadMore: () => Promise<void>
) {
  entries = newEntries;
  loadedLimit = limit;
  hasMore = limit != null && newEntries.length >= limit;
  onLoadMoreCb = loadMore;
  renderItems();
  updateFooter();
}

export function updateListEntries(newEntries: Entry[], limit?: number) {
  entries = newEntries;
  if (limit !== undefined) {
    loadedLimit = limit;
    hasMore = limit != null && newEntries.length >= limit;
  }
  if (!searchResults) renderItems();
  updateFooter();
}

function renderItems() {
  const display = searchResults ?? entries;
  itemsEl.innerHTML = '';
  for (const entry of display) {
    itemsEl.appendChild(buildRow(entry));
  }
}

function buildRow(entry: Entry): HTMLElement {
  const { year, month, day, weekday } = getDateParts(entry.date);

  const row = document.createElement('div');
  row.dataset.entryId = entry.id;
  row.className = 'flex border-b border-surface py-[10px] pr-5 flex-nowrap';
  row.style.cursor = 'default';

  const inner = document.createElement('div');
  inner.className = 'flex flex-row flex-1 justify-between';

  const dateSide = document.createElement('div');
  dateSide.className = 'w-[100px] text-center shrink-0 flex flex-col items-center justify-evenly py-[10px]';
  const weekdayEl = document.createElement('div');
  weekdayEl.textContent = weekday;
  const dateEl = document.createElement('div');
  dateEl.textContent = `${month} ${day} ${year}`;
  dateSide.appendChild(weekdayEl);
  dateSide.appendChild(dateEl);

  const contentSide = document.createElement('div');
  contentSide.className = 'flex-1 min-w-0 overflow-hidden';
  const preview = document.createElement('div');
  preview.className = 'max-h-[75px] overflow-hidden break-words cursor-default whitespace-pre-wrap';
  // Entry content is HTML authored by the user in Quill and stored as-is (no sanitization by design)
  preview.innerHTML = entry.content; // nosec
  contentSide.appendChild(preview);

  inner.appendChild(dateSide);
  inner.appendChild(contentSide);
  row.appendChild(inner);
  return row;
}

async function handleSearch() {
  const query = searchValue.trim();
  if (!query) { handleClearSearch(); return; }
  isSearching = true;
  searchPage = 1;
  updateFooter();
  const limit = db.getSearchLimit();
  try {
    const results = await db.searchEntries(query, limit);
    searchResults = results;
    activeQuery = query;
    hasMoreSearch = limit != null && results.length === limit;
    renderItems();
  } catch (error) {
    handleError(error);
    searchResults = [];
  } finally {
    isSearching = false;
    updateFooter();
  }
}

async function handleLoadMoreSearch() {
  const nextPage = searchPage + 1;
  const limit = db.getSearchLimit();
  if (limit == null) return;
  isSearching = true;
  updateFooter();
  try {
    const results = await db.searchEntries(activeQuery, limit * nextPage);
    searchResults = results;
    searchPage = nextPage;
    hasMoreSearch = results.length === limit * nextPage;
    renderItems();
  } catch (error) {
    handleError(error);
  } finally {
    isSearching = false;
    updateFooter();
  }
}

function handleClearSearch() {
  searchValue = '';
  activeQuery = '';
  searchResults = null;
  hasMoreSearch = false;
  searchPage = 1;
  isSearching = false;
  searchInput.value = '';
  renderItems();
  updateFooter();
}

function updateFooter() {
  statusEl.textContent = isSearching
    ? '...'
    : searchResults !== null
    ? `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${activeQuery}"`
    : '';

  loadMoreSearchBtn.style.display = hasMoreSearch && !isSearching ? '' : 'none';
  clearSearchBtn.style.display = searchValue ? '' : 'none';
  updateLoadMoreVisibility();
}

function updateLoadMoreVisibility() {
  if (!loadMoreBtn) return;
  const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 40;
  const show = hasMore && !searchResults && atBottom;
  loadMoreBtn.style.display = show ? '' : 'none';
  if (show) {
    loadMoreBtn.textContent = loadingMore ? 'Loading...' : `Load ${loadedLimit} more`;
    loadMoreBtn.disabled = loadingMore;
  }
}

export function setLoadingMore(val: boolean) {
  loadingMore = val;
  updateLoadMoreVisibility();
}

export function getLoadedLimit(): number | undefined {
  return loadedLimit;
}
