export function handleError(error: unknown, userMessage?: string): void {
  const msg = error instanceof Error
    ? `${error.message}${error.stack ? '\n' + error.stack : ''}`
    : String(error);

  console.error(error);
  window.logs?.error(msg);

  if (userMessage) alert(userMessage);
}
