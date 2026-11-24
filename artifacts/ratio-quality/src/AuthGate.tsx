import { useEffect, useState, type ReactNode } from 'react';
import { cloudEnabled, signIn, watchUser } from './cloud';
import { syncAll } from './data';
import { loadProfile } from './session';
import { RatioMark } from './features/brand-motion';

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
      Promise.race([loadProfile().then(() => syncAll()), new Promise(r => setTimeout(r, 8000))]).catch(() => {}).finally(() => setState('in'));
    });
  }, []);

  if (state === 'in') return <>{children}</>;
  if (state === 'loading' || state === 'syncing') return <div className="splash" dir="rtl"><RatioMark size={88} color="#fff" draw loop/><span>{state === 'syncing' ? 'جاري مزامنة البيانات…' : 'جاري التحميل…'}</span></div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await signIn(email.trim(), password); }
    catch { setError('تعذر تسجيل الدخول. تأكد من البريد وكلمة المرور والاتصال بالإنترنت.'); }
    finally { setBusy(false); }
  };
  return <div dir="rtl" className="login-screen">
    <form onSubmit={submit} className="login-card">
      <div className="login-mark"><RatioMark size={54} color="#07014F" draw/></div><img className="login-logo" src="/brand/logo-ar-navy.png" alt="ريشيو"/>
      <h1>منصة إدارة الجودة</h1>
      <p className="sub">سجّل دخولك للمتابعة</p>
      <label className="field"><span>البريد الإلكتروني</span><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required dir="ltr" inputMode="email"/></label>
      <label className="field"><span>كلمة المرور</span><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required dir="ltr"/></label>
      {error && <p role="alert" className="err">{error}</p>}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'جاري الدخول…' : 'دخول'}</button>
      <p className="hint">الحسابات تُنشأ بدعوة من مدير النظام.</p>
    </form>
  </div>;
}
