type Corner = 'tl' | 'tr' | 'bl' | 'br';

const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];
const CORNER_CSS: Record<Corner, string> = {
  tl: 'left:-6px;top:-6px;cursor:nwse-resize',
  tr: 'right:-6px;top:-6px;cursor:nesw-resize',
  bl: 'left:-6px;bottom:-6px;cursor:nesw-resize',
  br: 'right:-6px;bottom:-6px;cursor:nwse-resize',
};

function rectOf(img: HTMLImageElement, container: HTMLElement) {
  const c = container.getBoundingClientRect();
  const r = img.getBoundingClientRect();
  return { left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height };
}

export class ImageResizeOverlay {
  readonly el: HTMLElement;
  private img: HTMLImageElement;
  private container: HTMLElement;
  private onResize: () => void;
  private scrollCleanup: () => void;

  constructor(img: HTMLImageElement, container: HTMLElement, onResize: () => void) {
    this.img = img;
    this.container = container;
    this.onResize = onResize;

    this.el = document.createElement('div');
    this.el.style.cssText = 'position:absolute;border:1.5px solid var(--color-accent);pointer-events:none;z-index:10;';
    this.syncRect();

    for (const corner of CORNERS) {
      const handle = document.createElement('div');
      handle.dataset.resizeHandle = 'true';
      handle.style.cssText = `position:absolute;width:12px;height:12px;border-radius:50%;background:white;border:1px solid rgba(0,0,0,0.35);pointer-events:auto;${CORNER_CSS[corner]}`;
      handle.addEventListener('mousedown', (e) => this.startDrag(e, corner));
      this.el.appendChild(handle);
    }

    const onScroll = () => this.syncRect();
    window.addEventListener('scroll', onScroll, true);
    this.scrollCleanup = () => window.removeEventListener('scroll', onScroll, true);
  }

  syncRect() {
    const r = rectOf(this.img, this.container);
    this.el.style.left = r.left + 'px';
    this.el.style.top = r.top + 'px';
    this.el.style.width = r.width + 'px';
    this.el.style.height = r.height + 'px';
  }

  updateImage(img: HTMLImageElement) {
    this.img = img;
    this.syncRect();
  }

  private startDrag(e: MouseEvent, corner: Corner) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = this.img.getBoundingClientRect().width;
    const rightSide = corner === 'tr' || corner === 'br';

    const onMove = (ev: MouseEvent) => {
      const delta = rightSide ? ev.clientX - startX : startX - ev.clientX;
      this.img.setAttribute('width', String(Math.min(1000, Math.max(50, Math.round(startW + delta)))));
      this.syncRect();
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const ce = this.container.querySelector('[contenteditable]');
      if (ce) this.onResize();
      this.syncRect();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  destroy() {
    this.scrollCleanup();
    this.el.remove();
  }
}
