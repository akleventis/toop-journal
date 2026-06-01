// Module-level slot so NavBar can check for unsaved changes without prop drilling or a context provider.
// Register a guard in Edit/New when unsaved changes exist; NavBar calls checkNavGuard() on link click.
type GuardFn = () => Promise<boolean>;
let guard: GuardFn | null = null;

export const setNavGuard = (fn: GuardFn) => { guard = fn; window.appState?.setDirty(true); };
export const clearNavGuard = () => { guard = null; window.appState?.setDirty(false); };
export const checkNavGuard = async (): Promise<boolean> => {
  if (!guard) return true;
  const confirmed = await guard();
  if (confirmed) clearNavGuard();
  return confirmed;
};
export const hasNavGuard = () => guard !== null;
