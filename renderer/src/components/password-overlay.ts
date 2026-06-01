import { handleError } from '../../lib/error-handler';
import * as db from '../../db/db';

const FAIL_DELAY_MS = 1500;

export async function showPasswordOverlay(container: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    let locked = false;
    let lockTimer: ReturnType<typeof setTimeout> | null = null;

    const outer = document.createElement('div');
    outer.className = 'h-full flex items-center justify-center';
    const inner = document.createElement('div');
    inner.className = 'text-center';
    const label = document.createElement('p');
    label.style.fontSize = '15px';
    label.textContent = 'Login';
    const inputWrap = document.createElement('div');
    inputWrap.style.marginTop = '15px';
    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'w-[200px] border border-raised rounded bg-surface';
    const errorEl = document.createElement('p');
    errorEl.style.cssText = 'font-size:12px;margin-top:8px';
    errorEl.className = 'text-muted';
    errorEl.style.display = 'none';

    inputWrap.appendChild(input);
    inner.appendChild(label);
    inner.appendChild(inputWrap);
    inner.appendChild(errorEl);
    outer.appendChild(inner);
    container.appendChild(outer);
    container.onclick = () => input.focus();
    input.focus();

    const setError = (msg?: string) => {
      errorEl.textContent = msg ?? '';
      errorEl.style.display = msg ? '' : 'none';
    };

    const submit = async () => {
      if (locked || !input.value.trim()) return;
      try {
        const storedHash = await db.getPasswordHash();
        const storedSalt = await db.getPasswordSalt();
        if (!storedHash || !storedSalt) { setError('Password not configured'); return; }
        const isValid = await window.security.verifyPassword(input.value, storedHash, storedSalt);
        if (isValid) {
          if (lockTimer) clearTimeout(lockTimer);
          container.innerHTML = '';
          resolve();
        } else {
          input.value = '';
          locked = true;
          input.disabled = true;
          setError('Incorrect password');
          lockTimer = setTimeout(() => {
            locked = false;
            input.disabled = false;
            setError();
            input.focus();
          }, FAIL_DELAY_MS);
        }
      } catch (error) {
        handleError(error, 'Error verifying password');
      }
    };

    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
  });
}
