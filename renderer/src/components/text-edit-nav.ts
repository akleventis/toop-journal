import { NavDirection, settingsIcon } from '../../lib/constants';

export class TextEditNav {
  readonly el: HTMLElement;
  private dropdown: HTMLElement | null = null;
  private clickOutside: (e: MouseEvent) => void;

  constructor(
    onToggleEdit: () => void,
    onDelete: () => void,
    onNavigate?: (dir: NavDirection) => void
  ) {
    this.el = document.createElement('div');
    this.el.className = 'flex items-center justify-between px-5 py-[5px]';

    // Settings gear + dropdown
    const gearWrap = document.createElement('div');
    gearWrap.className = 'relative inline-block';

    const gearBtn = document.createElement('button');
    gearBtn.className = 'flex items-center justify-center';
    gearBtn.setAttribute('aria-label', 'Settings');
    // SVG is a static string with no user data — safe to use innerHTML here
    gearBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 90 90" fill="none"><path d="${settingsIcon}" fill="currentColor"/></svg>`;
    gearBtn.onmousedown = (e) => e.stopPropagation();
    gearBtn.onclick = () => this.toggleDropdown(onToggleEdit, onDelete);
    gearWrap.appendChild(gearBtn);
    this.el.appendChild(gearWrap);

    // Prev / Next buttons
    const navBtns = document.createElement('div');
    navBtns.className = 'flex gap-1';
    const prev = document.createElement('button');
    prev.textContent = ' ← ';
    prev.onclick = () => onNavigate?.(NavDirection.PREV);
    const next = document.createElement('button');
    next.textContent = ' → ';
    next.onclick = () => onNavigate?.(NavDirection.NEXT);
    navBtns.appendChild(prev);
    navBtns.appendChild(next);
    this.el.appendChild(navBtns);

    this.clickOutside = (e: MouseEvent) => {
      if (this.dropdown && !gearWrap.contains(e.target as Node)) this.closeDropdown();
    };
    document.addEventListener('mousedown', this.clickOutside);
  }

  private toggleDropdown(onToggleEdit: () => void, onDelete: () => void) {
    if (this.dropdown) { this.closeDropdown(); return; }

    const dd = document.createElement('div');
    dd.className = 'absolute left-full top-0 z-[1000] bg-surface p-1 rounded-sm ml-1 flex flex-col gap-[3px]';

    const editBtn = document.createElement('button');
    editBtn.className = 'block w-full text-left text-[12px] !py-[2px]';
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => { onToggleEdit(); this.closeDropdown(); };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'block w-full text-left text-[12px] !py-[2px]';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = () => { onDelete(); this.closeDropdown(); };

    dd.appendChild(editBtn);
    dd.appendChild(deleteBtn);
    this.el.querySelector('.relative')!.appendChild(dd);
    this.dropdown = dd;
  }

  private closeDropdown() {
    this.dropdown?.remove();
    this.dropdown = null;
  }

  destroy() {
    document.removeEventListener('mousedown', this.clickOutside);
    this.el.remove();
  }
}
