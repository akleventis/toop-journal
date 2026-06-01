export function confirmModal(message: string, confirmLabel = 'Leave'): Promise<boolean> {
  return new Promise((resolve) => {
    const close = openModal('', (closeModal) => {
      const wrap = document.createElement('div');
      wrap.className = 'flex flex-col gap-4';

      const msg = document.createElement('p');
      msg.className = 'text-[13px] m-0';
      msg.textContent = message;

      const btns = document.createElement('div');
      btns.className = 'flex justify-end gap-2';

      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      cancel.onclick = () => { closeModal(); resolve(false); };

      const leave = document.createElement('button');
      leave.textContent = confirmLabel;
      leave.className = '!py-[3px]';
      leave.style.cssText = 'background:var(--color-error);color:#fff';
      leave.onclick = () => { closeModal(); resolve(true); };

      btns.appendChild(cancel);
      btns.appendChild(leave);
      wrap.appendChild(msg);
      wrap.appendChild(btns);
      return wrap;
    });
    void close;
  });
}

export function alertModal(message: string): Promise<void> {
  return new Promise((resolve) => {
    openModal('', (closeModal) => {
      const wrap = document.createElement('div');
      wrap.className = 'flex flex-col gap-4';

      const msg = document.createElement('p');
      msg.className = 'text-[13px] m-0';
      msg.textContent = message;

      const btns = document.createElement('div');
      btns.className = 'flex justify-end';

      const ok = document.createElement('button');
      ok.textContent = 'OK';
      ok.onclick = () => { closeModal(); resolve(); };

      btns.appendChild(ok);
      wrap.appendChild(msg);
      wrap.appendChild(btns);
      return wrap;
    });
  });
}

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
