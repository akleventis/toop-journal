/**
 * Logs an error to the console and main-process log file. Optionally alerts the user.
 *
 * @param {unknown} error - The caught error.
 * @param {string} [userMessage] - If provided, shown to the user via alert().
 * @returns {void}
 */
export function handleError(error: unknown, userMessage?: string): void {
  const msg = error instanceof Error
    ? `${error.message}${error.stack ? '\n' + error.stack : ''}`
    : String(error);

  console.error(error);
  window.logs?.error(msg);

  if (userMessage) alert(userMessage);
}
