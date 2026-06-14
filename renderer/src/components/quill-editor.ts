import Quill from 'quill';
import 'quill/dist/quill.core.css';
import type { Entry } from '../../../shared/types';
import { deleteEntry } from '../../lib/entries';
import { confirmModal } from './modal';
import { NavDirection } from '../../lib/constants';
import { ImageResizeOverlay } from './image-resize';
import { TextEditNav } from './text-edit-nav';
import { FindBar } from './find-bar';

const DEFAULT_IMAGE_WIDTH = 200;
const Delta = Quill.import('delta') as any;

export type QuillEditorOptions = {
  displayNav: boolean;
  editable: boolean;
  entry: Entry | null;
  onNavigate?: (direction: NavDirection) => void;
  onEditModeChange?: (editing: boolean) => void;
  onContentChange?: (html: string) => void;
};

export class QuillEditor {
  readonly el: HTMLElement;
  private quill: Quill;
  private editorWrapper: HTMLElement;
  private isEditing: boolean;
  private overlay: ImageResizeOverlay | null = null;
  private nav: TextEditNav | null = null;
  private findBar: FindBar | null = null;
  private readonly onCmdF: (e: KeyboardEvent) => void;
  private onContentChange: ((html: string) => void) | undefined;
  private onEditModeChange: ((editing: boolean) => void) | undefined;

  constructor(opts: QuillEditorOptions) {
    this.isEditing = opts.editable;
    this.onContentChange = opts.onContentChange;
    this.onEditModeChange = opts.onEditModeChange;

    this.el = document.createElement('div');
    this.el.className = 'flex flex-col flex-1 min-h-0';

    if (opts.displayNav && !opts.editable) {
      this.nav = new TextEditNav(
        () => this.enableEditing(),
        () => this.handleDelete(opts.entry),
        opts.onNavigate
      );
      this.el.appendChild(this.nav.el);
    }

    this.editorWrapper = document.createElement('div');
    this.editorWrapper.style.cssText = 'position:relative;flex:1;min-height:0;display:flex;flex-direction:column';
    this.el.appendChild(this.editorWrapper);

    const editorDiv = document.createElement('div');
    this.editorWrapper.appendChild(editorDiv);

    // capture for closures before new Quill() runs
    let q: Quill;

    q = new Quill(editorDiv, {
      readOnly: !opts.editable,
      modules: {
        toolbar: false,
        clipboard: { matchVisual: false },
        history: { delay: 1000, maxStack: 500, userOnly: true },
        keyboard: {
          bindings: {
            tab: {
              key: 'Tab',
              shiftKey: false,
              handler(range: { index: number; length: number }) {
                q.deleteText(range.index, range.length, 'user');
                q.insertText(range.index, '\t', 'user');
                q.setSelection(range.index + 1, 0, 'silent');
                return false;
              },
            },
          },
        },
      },
    });
    this.quill = q;
    q.root.setAttribute('spellcheck', 'true');
    q.root.setAttribute('autocorrect', 'off');

    // Plain text only paste
    q.root.addEventListener('paste', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text) return;
      const sel = q.getSelection(true);
      q.deleteText(sel.index, sel.length, 'user');
      q.insertText(sel.index, text, 'user');
      q.setSelection(sel.index + text.length, 0, 'silent');
    }, { capture: true });

    // Plain text only copy
    q.root.addEventListener('copy', (e) => {
      const range = q.getSelection();
      if (!range || !range.length) return;
      e.clipboardData?.setData('text/plain', q.getText(range.index, range.length));
      e.preventDefault();
      e.stopImmediatePropagation();
    }, { capture: true });

    // Image drag-drop
    q.root.addEventListener('dragover', (e) => e.preventDefault(), { capture: true });
    q.root.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const files = Array.from(e.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      const range = q.getSelection(true) ?? { index: q.getLength(), length: 0 };
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          q.insertEmbed(range.index, 'image', reader.result as string, 'user');
          const img = q.root.querySelector<HTMLImageElement>(`img[src="${reader.result}"]`);
          if (img) img.setAttribute('width', String(DEFAULT_IMAGE_WIDTH));
          this.onContentChange?.(q.root.innerHTML);
        };
        reader.readAsDataURL(file);
      });
    }, { capture: true });

    // Image click → resize overlay
    q.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.dataset.resizeHandle) return;
      const img = target.tagName === 'IMG' ? target as HTMLImageElement : null;
      if (img && this.isEditing) {
        this.showOverlay(img);
      } else {
        this.hideOverlay();
      }
    });

    q.on('text-change', (_delta, _old, source) => {
      if (source === 'user') {
        this.hideOverlay();
        this.onContentChange?.(q.root.innerHTML);
      }
    });

    // Preserve raw \t characters when loading HTML
    q.clipboard.addMatcher(Node.TEXT_NODE, (node: Node) =>
      new Delta().insert((node as Text).data)
    );

    // Remove Quill's built-in bullet list auto-conversion
    const keyboard = q.getModule('keyboard') as any;
    Object.keys(keyboard.bindings).forEach(key => {
      keyboard.bindings[key] = keyboard.bindings[key]?.filter(
        (b: any) => !(b?.format?.['code-block'] === false && b?.format?.blockquote === false)
      );
    });

    this.loadEntry(opts.entry, opts.editable);

    this.onCmdF = (e: KeyboardEvent) => {
      if (e.key === 'f' && e.metaKey) {
        e.preventDefault();
        this.findBar ? this.findBar.focus() : this.openFindBar();
      }
    };
    document.addEventListener('keydown', this.onCmdF);
  }

  loadEntry(entry: Entry | null, editable: boolean) {
    const q = this.quill;
    q.enable(false);
    q.history.clear();
    q.clipboard.dangerouslyPasteHTML(entry?.content ?? '');
    q.enable(editable);
    q.history.clear();
    this.isEditing = editable;
    this.hideOverlay();
    this.onEditModeChange?.(editable);
    // Pass Quill-normalized HTML so the dirty-check baseline matches what text-change emits
    this.onContentChange?.(q.root.innerHTML);
  }

  private openFindBar() {
    this.findBar = new FindBar(this.quill, () => this.closeFindBar());
    this.editorWrapper.appendChild(this.findBar.el);
    this.findBar.focus();
  }

  private closeFindBar() {
    this.findBar?.destroy();
    this.findBar = null;
  }

  private enableEditing() {
    this.closeFindBar();
    this.quill.enable(true);
    this.isEditing = true;
    this.nav?.destroy();
    this.nav = null;
    this.onEditModeChange?.(true);
  }

  private async handleDelete(entry: Entry | null) {
    if (!entry) return;
    if (await confirmModal('Are you sure you want to delete this entry?', 'Delete')) {
      await deleteEntry(entry.id);
    }
  }

  private showOverlay(img: HTMLImageElement) {
    if (this.overlay) {
      this.overlay.updateImage(img);
      return;
    }
    this.overlay = new ImageResizeOverlay(img, this.editorWrapper, () => {
      this.onContentChange?.(this.quill.root.innerHTML);
    });
    this.editorWrapper.appendChild(this.overlay.el);
  }

  private hideOverlay() {
    this.overlay?.destroy();
    this.overlay = null;
  }

  focus() {
    this.quill.focus();
  }

  getHTML(): string {
    return this.quill.root.innerHTML;
  }

  destroy() {
    this.closeFindBar();
    document.removeEventListener('keydown', this.onCmdF);
    this.hideOverlay();
    this.nav?.destroy();
  }
}
