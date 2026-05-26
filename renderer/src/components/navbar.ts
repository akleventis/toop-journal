import { checkNavGuard } from '../../lib/nav-guard';
import { networkManager } from '../../lib/network-manager';

const TABS = [
  { path: '/new', label: 'New' },
  { path: '/list', label: 'List' },
  { path: '/calendar', label: 'Calendar' },
  { path: '/more', label: 'More' },
];

export function initNavBar(container: HTMLElement) {
  const wrap = document.createElement('div');
  wrap.className = 'relative flex justify-center py-2 px-4';

  const nav = document.createElement('nav');
  nav.className = 'surface flex items-center gap-1 py-1.5 px-1 rounded-sm';

  for (const tab of TABS) {
    const a = document.createElement('a');
    a.href = '#' + tab.path;
    a.dataset.path = tab.path;
    a.className = 'w-[68px] py-[5px] rounded-sm text-center text-[12px] font-medium opacity-50';
    a.textContent = tab.label;
    a.addEventListener('click', (e) => { if (!checkNavGuard()) e.preventDefault(); });
    nav.appendChild(a);
  }

  const statusWrap = document.createElement('div');
  statusWrap.className = 'absolute right-6 top-1/2 -translate-y-1/2 group flex items-center gap-1';

  const label = document.createElement('span');
  label.className = 'text-[9px] text-muted opacity-0 group-hover:opacity-100 pointer-events-none';

  const dot = document.createElement('div');
  dot.className = 'w-[5px] h-[5px] rounded-full';

  const updateNetwork = (online: boolean) => {
    dot.style.backgroundColor = online ? 'var(--color-success)' : 'var(--color-error)';
    label.textContent = online ? 'online' : 'offline';
  };
  updateNetwork(networkManager.isOnline());
  networkManager.subscribe(updateNetwork);

  statusWrap.appendChild(label);
  statusWrap.appendChild(dot);
  wrap.appendChild(nav);
  wrap.appendChild(statusWrap);
  container.appendChild(wrap);
}

export function updateNavBarActive(path: string) {
  document.querySelectorAll<HTMLAnchorElement>('a[data-path]').forEach(a => {
    const active = a.dataset.path === path;
    a.classList.toggle('bg-raised', active);
    a.classList.toggle('opacity-50', !active);
  });
}
