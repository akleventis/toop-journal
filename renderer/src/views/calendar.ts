import type { Cleanup } from '../router';
import type { Entry } from '../../../shared/types';
import { journalToCalendar, createCalendarDate, getDaysInMonth, getFirstDayOfMonth } from '../../lib/dates';
import { YearSelector } from '../components/year-selector';
import { navigate } from '../router';

let selectedYear = new Date().getFullYear();

export function mountCalendar(container: HTMLElement, entries: Entry[]): Cleanup {
  container.replaceChildren();

  const entriesByDate = buildIndex(entries);
  const yearsWithEntries = new Set(entries.map(e => parseInt(journalToCalendar(e.date).slice(0, 4), 10)));

  const wrap = document.createElement('div');
  wrap.style.padding = '10px';

  const yearSelector = new YearSelector(selectedYear, (year) => {
    selectedYear = year;
    renderMonths(year, entriesByDate, monthsWrap);
  }, yearsWithEntries);
  wrap.appendChild(yearSelector.el);

  const monthsWrap = document.createElement('div');
  monthsWrap.className = 'flex flex-wrap justify-evenly gap-[10px]';
  renderMonths(selectedYear, entriesByDate, monthsWrap);
  wrap.appendChild(monthsWrap);

  container.appendChild(wrap);

  return () => yearSelector.destroy();
}

function buildIndex(entries: Entry[]): Record<string, Entry> {
  const map: Record<string, Entry> = {};
  for (const e of entries) map[journalToCalendar(e.date)] = e;
  return map;
}

function renderMonths(year: number, entriesByDate: Record<string, Entry>, container: HTMLElement) {
  container.replaceChildren();
  for (let month = 0; month < 12; month++) {
    container.appendChild(buildMonth(year, month, entriesByDate));
  }
}

function buildMonth(year: number, month: number, entriesByDate: Record<string, Entry>): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin:4px;display:inline-block';

  const monthName = new Date(year, month).toLocaleDateString('en-US', { month: 'long' });
  const h3 = document.createElement('h3');
  h3.style.cssText = 'text-align:center;margin:0 0 6px 0;font-size:15px';
  h3.textContent = monthName;
  wrap.appendChild(h3);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;gap:4px;grid-template-columns:repeat(7,28px)';

  const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  for (const d of DAYS) {
    const cell = document.createElement('div');
    cell.style.cssText = 'text-align:center;font-weight:bold;font-size:11px;height:28px;display:flex;align-items:center;justify-content:center';
    cell.textContent = d;
    grid.appendChild(cell);
  }

  const firstDay = getFirstDayOfMonth(year, month);
  for (let i = 0; i < firstDay; i++) {
    grid.appendChild(document.createElement('div'));
  }

  const daysInMonth = getDaysInMonth(year, month);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = createCalendarDate(year, month, day);
    const hasEntry = !!entriesByDate[date];

    const cell = document.createElement('div');
    cell.style.cssText = `border-radius:4px;text-align:center;width:28px;height:28px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;background:${hasEntry ? 'var(--color-third-bg)' : 'transparent'}`;
    cell.textContent = String(day);
    cell.onclick = () => {
      const entry = entriesByDate[date];
      if (entry) {
        navigate('/edit', { id: entry.id });
      } else {
        navigate('/new', { date });
      }
    };
    grid.appendChild(cell);
  }

  wrap.appendChild(grid);
  return wrap;
}
