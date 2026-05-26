export function openModal(title: string, buildContent: (close: () => void) => HTMLElement): () => void {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;';
  overlay.style.background = 'var(--color-modal-overlay)';

  const card = document.createElement('div');
  card.className = 'card flex flex-col gap-3 min-w-[280px] max-w-[90vw]';
  card.onclick = (e) => e.stopPropagation();

  const close = () => overlay.remove();

  if (title) {
    const titleEl = document.createElement('p');
    titleEl.className = 'section-label m-0';
    titleEl.textContent = title;
    card.appendChild(titleEl);
  }

  card.appendChild(buildContent(close));
  overlay.appendChild(card);
  overlay.onclick = close;
  document.body.appendChild(overlay);

  return close;
}
