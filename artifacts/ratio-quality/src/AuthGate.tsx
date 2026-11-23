import { useEffect, useState, type ReactNode } from 'react';
import { cloudEnabled, signIn, signOutUser, watchUser } from './cloud';
import { syncAll } from './data';

/** When Firebase is configured, requires sign-in and runs a sync before the app mounts. Otherwise a no-op. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'out' | 'syncing' | 'in'>(cloudEnabled ? 'loading' : 'in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cloudEnabled) return;
    return watchUser(user => {
      if (!user) { setState('out'); return; }
      setState('syncing');
      // Never block the inspector offline: give sync a few seconds, then continue with local data.
      Promise.race([syncAll(), new Promise(r => setTimeout(r, 8000))]).catch(() => {}).finally(() => setState('in'));
    });
  }, []);

  if (state === 'in') return <>{cloudEnabled && <button onClick={() => signOutUser()} style={{ position: 'fixed', top: 6, left: 6, zIndex: 50, fontSize: 11, opacity: .6, background: 'none', border: 0 }}>تسجيل الخروج</button>}{children}</>;
  if (state === 'loading' || state === 'syncing') return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }} dir="rtl">{state === 'syncing' ? 'جاري مزامنة البيانات…' : 'جاري التحميل…'}</div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await signIn(email.trim(), password); }
    catch { setError('تعذر تسجيل الدخول. تأكد من البريد وكلمة المرور والاتصال بالإنترنت.'); }
    finally { setBusy(false); }
  };
  return <div dir="rtl" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
    <form onSubmit={submit} className="surface-card" style={{ width: '100%', maxWidth: 380, padding: 24, display: 'grid', gap: 14 }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>ريشيو للجودة</h1>
      <label className="field"><span>البريد الإلكتروني</span><input className="typed-input" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required dir="ltr"/></label>
      <label className="field"><span>كلمة المرور</span><input className="typed-input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required dir="ltr"/></label>
      {error && <p role="alert" style={{ color: '#b3261e', margin: 0 }}>{error}</p>}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'جاري الدخول…' : 'دخول'}</button>
    </form>
  </div>;
}
