// Local error ring buffer + one-tap diagnostics, so a problem seen on a phone can be reported without a computer.
declare const __APP_VERSION__: string;
const KEY = 'rq-errors';
export type ErrEntry = { at: string; where: string; message: string; stack?: string };
const read = (): ErrEntry[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
export const getErrors = read;
export const clearErrors = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
export function logError(where: string, e: unknown) {
  try {
    const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : JSON.stringify(e));
    const list = read(); const last = list[list.length - 1];
    if (last && last.message === err.message && last.where === where) return; // dedupe bursts
    list.push({ at: new Date().toISOString(), where, message: err.message.slice(0, 300), stack: err.stack?.split('\n').slice(0, 4).join(' | ').slice(0, 500) });
    localStorage.setItem(KEY, JSON.stringify(list.slice(-40)));
  } catch { /* storage unavailable */ }
}
export function installErrorLog() {
  window.addEventListener('error', ev => logError('window', ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', ev => logError('promise', ev.reason));
}
export const appVersion = () => typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export async function buildDiagnostics(extra: Record<string, unknown> = {}) {
  let storage: unknown = null; try { const e = await navigator.storage?.estimate?.(); storage = e ? { usedMB: Math.round((e.usage ?? 0) / 1048576), quotaMB: Math.round((e.quota ?? 0) / 1048576) } : null; } catch { /* ignore */ }
  let persisted: boolean | null = null; try { persisted = (await navigator.storage?.persisted?.()) ?? null; } catch { /* ignore */ }
  return JSON.stringify({ app: 'ratio-quality', version: appVersion(), at: new Date().toISOString(), online: navigator.onLine, standalone: window.matchMedia?.('(display-mode: standalone)').matches, ua: navigator.userAgent, screen: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`, storage, persisted, ...extra, errors: read() }, null, 2);
}
