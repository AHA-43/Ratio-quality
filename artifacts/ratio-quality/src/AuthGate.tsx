import { useEffect, useState, type ReactNode } from 'react';
import { cloudEnabled, resetPassword, signIn, watchUser } from './cloud';
import { syncAll } from './data';
import { loadProfile } from './session';
import { RatioMark } from './features/brand-motion';

/** When Firebase is configured, requires sign-in and runs a sync before the app mounts. Otherwise a no-op. */
const t0 = Date.now(); // splash holds until the logo has finished drawing
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'out' | 'syncing' | 'in'>(cloudEnabled ? 'loading' : 'in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'reset'>('login'); const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!cloudEnabled) return;
    return watchUser(user => {
      if (!user) { setState('out'); return; }
      setState('syncing');
      // Open as soon as the profile is known (local data shows at once); the sync continues in the background
      // and screens refresh by themselves when new records arrive.
      Promise.race([loadProfile(), new Promise(r => setTimeout(r, 4000))]).catch(() => {}).then(() => { syncAll().catch(() => {}); return new Promise(r => setTimeout(r, Math.max(0, 1800 - (Date.now() - t0)))); }).finally(() => setState('in'));
    });
  }, []);

  if (state === 'in') return <>{children}</>;
  if (state === 'loading' || state === 'syncing') return <div className="splash" dir="rtl"><RatioMark size={88} color="#fff" className="slow"/><span>{state === 'syncing' ? 'جاري مزامنة البيانات' : 'جاري التحميل'}<b className="splash-dots"/></span><div className="splash-line"><i/></div></div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await signIn(email.trim(), password); }
    catch { setError('تعذر تسجيل الدخول. تأكد من البريد وكلمة المرور والاتصال بالإنترنت.'); }
    finally { setBusy(false); }
  };
  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await resetPassword(email); setSent(true); } catch { setError('تعذّر إرسال الرابط. تأكد من البريد والاتصال بالإنترنت ثم أعد المحاولة.'); }
    finally { setBusy(false); }
  };
  if (mode === 'reset') return <div dir="rtl" className="login-screen">
    <form onSubmit={submitReset} className="login-card">
      <div className="login-mark"><RatioMark size={54} color="#07014F" draw/></div><img className="login-logo" src="/brand/logo-ar-navy.png" alt="ريشيو"/>
      <h1>استعادة كلمة المرور</h1>
      {sent ? <><p className="sub" role="status" data-testid="reset-sent">إذا كان البريد مسجلاً لدينا فسيصلك رابط لتعيين كلمة مرور جديدة خلال دقائق. تفقّد البريد (وصندوق الرسائل غير المرغوبة).</p>
        <button className="button button-primary" type="button" onClick={() => { setMode('login'); setSent(false); setError(''); }}>العودة لتسجيل الدخول</button></>
        : <><p className="sub">اكتب بريدك الإلكتروني وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.</p>
          <label className="field"><span>البريد الإلكتروني</span><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required dir="ltr" inputMode="email" data-testid="input-reset-email"/></label>
          {error && <p role="alert" className="err">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy || !email.trim()} data-testid="button-reset-send">{busy ? 'جارٍ الإرسال…' : 'إرسال الرابط'}</button>
          <button className="login-link" type="button" onClick={() => { setMode('login'); setError(''); }}>رجوع</button></>}
    </form>
  </div>;
  return <div dir="rtl" className="login-screen">
    <form onSubmit={submit} className="login-card">
      <div className="login-mark"><RatioMark size={54} color="#07014F" draw/></div><img className="login-logo" src="/brand/logo-ar-navy.png" alt="ريشيو"/>
      <h1>منصة إدارة الجودة</h1>
      <p className="sub">سجّل دخولك للمتابعة</p>
      <label className="field"><span>البريد الإلكتروني</span><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required dir="ltr" inputMode="email"/></label>
      <label className="field"><span>كلمة المرور</span><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required dir="ltr"/></label>
      {error && <p role="alert" className="err">{error}</p>}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'جاري الدخول…' : 'دخول'}</button>
      <button className="login-link" type="button" onClick={() => { setMode('reset'); setError(''); }} data-testid="link-forgot">نسيت كلمة المرور؟</button>
      <p className="hint">الحسابات تُنشأ بدعوة من مدير النظام.</p>
    </form>
  </div>;
}
