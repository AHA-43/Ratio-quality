import { useEffect, useState } from 'react';
import { lazy, type ComponentType } from 'react';

/** Ask the browser not to evict our offline data (iOS/Chrome can wipe unpersisted storage under pressure). */
export async function requestPersistence() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* unsupported */ }
}

export type Usage = { usedMB: number; quotaMB: number; pct: number };
export async function storageUsage(): Promise<Usage | null> {
  try {
    const e = await navigator.storage?.estimate?.(); if (!e?.quota || e.usage === undefined) return null;
    return { usedMB: Math.round(e.usage / 1048576), quotaMB: Math.round(e.quota / 1048576), pct: Math.round(e.usage / e.quota * 100) };
  } catch { return null; }
}
/** Percentage of device storage in use once it passes the warning level, else null. */
export function useStorageWarning(level = 80) {
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => { let on = true; const run = () => storageUsage().then(x => { if (on) setU(x && x.pct >= level ? x : null); }); run(); const t = window.setInterval(run, 120000); return () => { on = false; window.clearInterval(t); }; }, [level]);
  return u;
}

/** React.lazy that survives a deploy: if the chunk 404s (old tab after a new release) reload once to fetch the new shell. */
export function lazyRetry<T extends ComponentType<never>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    const key = 'rq-chunk-reload';
    try { const m = await load(); try { sessionStorage.removeItem(key); } catch { /* ignore */ } return m; }
    catch (e) {
      let tried = false; try { tried = sessionStorage.getItem(key) === '1'; sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
      if (!tried) { window.location.reload(); return new Promise<never>(() => {}); }
      throw e;
    }
  });
}

/** True once a new service worker has taken over after this page loaded (a new version is available). */
export function useUpdateAvailable() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const had = Boolean(navigator.serviceWorker.controller);
    const on = () => { if (had) setReady(true); };
    navigator.serviceWorker.addEventListener('controllerchange', on);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', on);
  }, []);
  return ready;
}
