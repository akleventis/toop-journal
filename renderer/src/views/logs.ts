import type { Cleanup } from '../router';

function lineColor(line: string): string {
  if (line.includes('[ERROR]')) return '#f87171';
  if (line.includes('[WARN]'))  return '#facc15';
  if (line.includes('[DEBUG]')) return '#6b7280';
  return '#d1d5db';
}

export function mountLogs(container: HTMLElement): Cleanup {
  container.replaceChildren();
  container.style.cssText = 'height:100%;display:flex;flex-direction:column;background:black;overflow:hidden';

  const scroll = document.createElement('div');
  scroll.style.cssText = 'flex:1;overflow-y:auto;padding:12px;font-family:monospace;font-size:11px;line-height:1.6';

  const emptyMsg = document.createElement('div');
  emptyMsg.style.color = '#4b5563';
  emptyMsg.textContent = 'No logs yet.';
  scroll.appendChild(emptyMsg);

  container.appendChild(scroll);

  const appendLine = (line: string) => {
    if (emptyMsg.parentNode) emptyMsg.remove();
    const div = document.createElement('div');
    div.style.color = lineColor(line);
    div.textContent = line;
    scroll.appendChild(div);
    scroll.scrollTop = scroll.scrollHeight;
  };

  if (!window.logs) return () => {};

  window.logs.getRecent().then(lines => {
    for (const line of lines) appendLine(line);
  });

  const cleanup = window.logs.onLine(appendLine);
  return cleanup;
}
