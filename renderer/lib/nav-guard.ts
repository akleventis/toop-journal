// Module-level slot so NavBar can check for unsaved changes without prop drilling or a context provider.
// Register a guard in Edit/New when unsaved changes exist; NavBar calls checkNavGuard() on link click.
type GuardFn = () => boolean;
let guard: GuardFn | null = null;

export const setNavGuard = (fn: GuardFn) => { guard = fn; window.appState?.setDirty(true); };
export const clearNavGuard = () => { guard = null; window.appState?.setDirty(false); };
export const checkNavGuard = (): boolean => guard ? guard() : true;
