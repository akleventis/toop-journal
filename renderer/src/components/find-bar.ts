import type Quill from 'quill';

// CSS Custom Highlight API paints matches without touching the selection, so focus stays in the input
const ALL = 'find-match';
const CURRENT = 'find-current';

export class FindBar {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private countEl: HTMLSpanElement;
  private matches: Range[] = [];
  private currentIdx = -1;
  private readonly quill: Quill;
  private readonly onTextChange: () => void;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(quill: Quill, onClose: () => void) {
    this.quill = quill;
    // edits shift text nodes under the stored ranges; drop them so the next Enter re-searches
    this.onTextChange = () => this.reset();
    this.quill.on('text-change', this.onTextChange);

    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:absolute;top:8px;right:12px;z-index:1000;display:flex;align-items:center;' +
      'gap:4px;background:var(--color-secondary-bg);border:1px solid var(--border);' +
      'border-radius:var(--radius-sm);padding:4px 6px;box-shadow:0 2px 8px rgba(0,0,0,0.15)';

    this.input = document.createElement('input');
    this.input.placeholder = 'Find…';
    this.input.style.cssText = 'width:190px;border:none;background:transparent;padding:2px 4px;font-size:12px;outline:none';
    this.input.addEventListener('input', () => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.search(), 150);
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // pending or stale search runs now; otherwise cycle
        if (this.searchTimer !== undefined || !this.matches.length) {
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

  private reset() {
    this.matches = [];
    this.currentIdx = -1;
    CSS.highlights.delete(ALL);
    CSS.highlights.delete(CURRENT);
    this.updateCount();
  }

  private next() {
    this.show((this.currentIdx + 1) % this.matches.length);
  }

  private prev() {
    this.show((this.currentIdx - 1 + this.matches.length) % this.matches.length);
  }

  private search() {
    clearTimeout(this.searchTimer);
    this.searchTimer = undefined;
    this.reset();
    const q = this.input.value.trim();
    if (!q) return;

    // concat text nodes with offsets so a match spanning formatting boundaries maps back to a Range
    const nodes: { node: Text; start: number }[] = [];
    let text = '';
    const walker = document.createTreeWalker(this.quill.root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      nodes.push({ node: n, start: text.length });
      text += n.data;
    }
    const locate = (pos: number) => {
      let i = nodes.length - 1;
      while (i > 0 && nodes[i].start > pos) i--;
      return { node: nodes[i].node, offset: pos - nodes[i].start };
    };

    // regex over the original text: toLowerCase can change length (e.g. İ) and skew offsets
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    for (const m of text.matchAll(re)) {
      const s = locate(m.index);
      const e = locate(m.index + m[0].length - 1);
      const r = document.createRange();
      r.setStart(s.node, s.offset);
      r.setEnd(e.node, e.offset + 1);
      this.matches.push(r);
    }

    if (this.matches.length) {
      CSS.highlights.set(ALL, new Highlight(...this.matches));
      this.show(0);
    } else {
      this.updateCount();
    }
  }

  private show(idx: number) {
    this.currentIdx = idx;
    const r = this.matches[idx];
    CSS.highlights.set(CURRENT, new Highlight(r));
    // .ql-editor is the scroll container; center the match only when it's out of view
    const root = this.quill.root;
    const box = root.getBoundingClientRect();
    const rect = r.getBoundingClientRect();
    if (rect.top < box.top || rect.bottom > box.bottom) {
      root.scrollTop += rect.top - box.top - (box.height - rect.height) / 2;
    }
    this.updateCount();
  }

  private updateCount() {
    if (!this.input.value) { this.countEl.textContent = ''; return; }
    this.countEl.textContent = this.matches.length
      ? `${this.currentIdx + 1} / ${this.matches.length}`
      : '0 / 0';
  }

  destroy() {
    clearTimeout(this.searchTimer);
    this.quill.off('text-change', this.onTextChange);
    CSS.highlights.delete(ALL);
    CSS.highlights.delete(CURRENT);
    this.el.remove();
  }
}
