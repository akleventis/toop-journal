import type Quill from 'quill';

export class FindBar {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private countEl: HTMLSpanElement;
  private matchCount = 0;
  private currentIdx = -1;
  private readonly quill: Quill;

  constructor(quill: Quill, onClose: () => void) {
    this.quill = quill;

    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:absolute;top:8px;right:12px;z-index:1000;display:flex;align-items:center;' +
      'gap:4px;background:var(--color-secondary-bg);border:1px solid var(--border);' +
      'border-radius:var(--radius-sm);padding:4px 6px;box-shadow:0 2px 8px rgba(0,0,0,0.15)';

    this.input = document.createElement('input');
    this.input.placeholder = 'Find… (Enter to search)';
    this.input.style.cssText = 'width:190px;border:none;background:transparent;padding:2px 4px;font-size:12px;outline:none';
    this.input.addEventListener('input', () => {
      this.matchCount = 0;
      this.currentIdx = -1;
      this.countEl.textContent = '';
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { onClose(); e.preventDefault(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        // first Enter triggers the search; subsequent Enter cycles matches
        if (!this.matchCount) {
          this.search();
        } else {
          e.shiftKey ? this.prev() : this.next();
        }
      }
    });

    this.countEl = document.createElement('span');
    this.countEl.style.cssText =
      'font-size:11px;color:var(--text-muted);min-width:36px;text-align:center;white-space:nowrap';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'padding:2px 6px;font-size:14px;line-height:1;border:none;background:transparent';
    closeBtn.onmousedown = (e) => e.preventDefault();
    closeBtn.onclick = () => onClose();

    this.el.append(this.input, this.countEl, closeBtn);
  }

  focus() {
    this.input.focus();
    this.input.select();
  }

  // window.find is a non-standard WebKit extension with no scope API — searches full document
  private wfind(reverse = false) {
    (window as any).find(this.input.value, false, reverse, true);
  }

  private next() {
    this.currentIdx = (this.currentIdx + 1) % this.matchCount;
    this.wfind();
    this.updateCount();
  }

  private prev() {
    this.currentIdx = (this.currentIdx - 1 + this.matchCount) % this.matchCount;
    this.wfind(true);
    this.updateCount();
  }

  private search() {
    const q = this.input.value.trim();
    this.matchCount = 0;
    this.currentIdx = -1;

    if (q) {
      // match count is derived from quill.root text; window.find highlight may diverge
      // (e.g. terms spanning element boundaries, or matches outside the editor)
      const text = (this.quill.root.textContent ?? '').toLowerCase();
      const lower = q.toLowerCase();
      let i = 0;
      while (true) {
        const idx = text.indexOf(lower, i);
        if (idx === -1) break;
        this.matchCount++;
        i = idx + lower.length;
      }
      if (this.matchCount) {
        this.currentIdx = 0;
        this.wfind();
      }
    }

    this.updateCount();
  }

  private updateCount() {
    if (!this.input.value) { this.countEl.textContent = ''; return; }
    this.countEl.textContent = this.matchCount
      ? `${this.currentIdx + 1} / ${this.matchCount}`
      : '0 / 0';
  }

  destroy() {
    window.getSelection()?.removeAllRanges();
    this.el.remove();
  }
}
