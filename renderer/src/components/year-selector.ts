export class YearSelector {
  readonly el: HTMLElement;
  private displayYear: number;
  private gridYear: number;
  private isOpen = false;
  private dropdown: HTMLElement | null = null;
  private button: HTMLButtonElement;
  private onYearChange: (year: number) => void;
  private yearsWithEntries: Set<number>;
  private clickOutside: (e: MouseEvent) => void;

  constructor(currentYear: number, onYearChange: (year: number) => void, yearsWithEntries: Set<number>) {
    this.displayYear = currentYear;
    this.gridYear = currentYear;
    this.onYearChange = onYearChange;
    this.yearsWithEntries = yearsWithEntries;

    this.el = document.createElement('div');
    this.el.className = 'text-center relative';
    this.el.style.marginBottom = '10px';

    this.button = document.createElement('button');
    this.button.className = 'px-[10px] py-[5px] rounded cursor-pointer';
    this.button.textContent = `${currentYear} ▼`;
    this.button.onclick = () => this.toggleOpen();
    this.el.appendChild(this.button);

    this.clickOutside = (e: MouseEvent) => {
      if (this.isOpen && !this.el.contains(e.target as Node)) this.close();
    };
    document.addEventListener('mousedown', this.clickOutside);
  }

  updateEntries(yearsWithEntries: Set<number>) {
    this.yearsWithEntries = yearsWithEntries;
    if (this.isOpen) this.renderDropdown();
  }

  private toggleOpen() {
    this.isOpen ? this.close() : this.open();
  }

  private open() {
    this.isOpen = true;
    this.renderDropdown();
  }

  private close() {
    this.isOpen = false;
    this.dropdown?.remove();
    this.dropdown = null;
  }

  private renderDropdown() {
    this.dropdown?.remove();
    const dd = document.createElement('div');
    dd.className = 'absolute bg-app border border-raised rounded p-[10px] z-[1000] mt-[5px]';
    dd.style.cssText += 'top:100%;left:50%;transform:translateX(-50%)';

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-3 gap-[5px] w-[200px] mb-[10px]';

    const years = this.generateGrid();
    for (const year of years) {
      const btn = document.createElement('button');
      btn.className = 'py-1 rounded cursor-pointer';
      btn.style.background = year === this.displayYear ? 'var(--color-third-bg)' : 'var(--color-app-bg)';
      btn.style.fontWeight = this.yearsWithEntries.has(year) ? 'bold' : 'normal';
      btn.textContent = String(year);
      btn.onclick = () => this.select(year);
      grid.appendChild(btn);
    }

    const nav = document.createElement('div');
    nav.className = 'flex justify-center gap-[50px]';
    const prev = document.createElement('button');
    prev.textContent = ' ← ';
    prev.disabled = this.gridYear <= 1000;
    prev.onclick = () => { this.gridYear = Math.max(1000, this.gridYear - 12); this.renderDropdown(); };
    const next = document.createElement('button');
    next.textContent = ' → ';
    next.disabled = this.gridYear >= 3000;
    next.onclick = () => { this.gridYear = Math.min(3000, this.gridYear + 12); this.renderDropdown(); };
    nav.appendChild(prev);
    nav.appendChild(next);

    dd.appendChild(grid);
    dd.appendChild(nav);
    this.el.appendChild(dd);
    this.dropdown = dd;
  }

  private generateGrid(): number[] {
    const start = Math.max(1000, this.gridYear - 6);
    const end = Math.min(3000, start + 11);
    const years: number[] = [];
    for (let y = start; y <= end; y++) years.push(y);
    return years;
  }

  private select(year: number) {
    this.displayYear = year;
    this.gridYear = year;
    this.button.textContent = `${year} ▼`;
    this.onYearChange(year);
    this.close();
  }

  destroy() {
    document.removeEventListener('mousedown', this.clickOutside);
  }
}
