import { checkNavGuard } from '../lib/nav-guard';

export type Cleanup = () => void;
export type ViewMount = (params: URLSearchParams) => Cleanup | void;

const routes: Record<string, ViewMount> = {};
let currentCleanup: Cleanup | void;
let routeChangeCallback: ((path: string) => void) | undefined;

export function registerRoutes(handlers: Record<string, ViewMount>) {
  Object.assign(routes, handlers);
}

export function onRouteChange(cb: (path: string) => void) {
  routeChangeCallback = cb;
}

export async function navigate(path: string, params?: Record<string, string>) {
  if (!await checkNavGuard()) return;
  const search = params ? '?' + new URLSearchParams(params).toString() : '';
  window.location.hash = '#' + path + search;
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
}

export function handleRoute() {
  const hash = window.location.hash.slice(1) || '/';
  const qIdx = hash.indexOf('?');
  const path = qIdx === -1 ? hash : hash.slice(0, qIdx);
  const search = qIdx === -1 ? '' : hash.slice(qIdx + 1);
  const params = new URLSearchParams(search);

  if (currentCleanup) {
    currentCleanup();
    currentCleanup = undefined;
  }

  routeChangeCallback?.(path);

  const handler = routes[path];
  if (handler) currentCleanup = handler(params) ?? undefined;
}
