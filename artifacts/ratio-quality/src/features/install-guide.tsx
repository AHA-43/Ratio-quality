import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Plus, Share, X } from 'lucide-react';
import { RatioMark } from './brand-motion';

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
const KEY = 'rq-install';
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
const platform = () => { const ua = navigator.userAgent; return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop'; };
const inAppBrowser = () => /FBAN|FBAV|Instagram|Line\/|Snapchat|Twitter|WhatsApp|MicroMessenger|; wv\)/i.test(navigator.userAgent);
let deferred: BIPEvent | null = null;
if (typeof window !== 'undefined') window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as BIPEvent; window.dispatchEvent(new Event('rq-bip')); });

const snoozed = () => { try { const t = Number(localStorage.getItem(KEY)); return t && Date.now() < t; } catch { return false; } };
const snooze = (days: number) => { try { localStorage.setItem(KEY, String(Date.now() + days * 86400000)); } catch { /* ignore */ } };

/** Home-screen card that walks the inspector through installing the app (the best field experience). */
export function InstallCard() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => isStandalone() || snoozed());
  const [, force] = useState(0);
  useEffect(() => { const f = () => force(n => n + 1); window.addEventListener('rq-bip', f); return () => window.removeEventListener('rq-bip', f); }, []);
  if (hidden || platform() === 'desktop' && !deferred) return null;
  const go = async () => {
    if (deferred) { await deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; if (r?.outcome === 'accepted') { setHidden(true); return; } force(n => n + 1); return; }
    setOpen(true);
  };
  return <>
    <section className="install-card">
      <span className="ic-mark"><RatioMark size={34} color="#fff"/></span>
      <div><b>ثبّت التطبيق على جوالك</b><small>يفتح بضغطة من الشاشة الرئيسية، أسرع، ويعمل بدون إنترنت داخل الفروع.</small></div>
      <div className="ic-actions"><button type="button" className="ic-go" onClick={go}><Download size={16}/> طريقة التثبيت</button><button type="button" className="ic-later" onClick={() => { snooze(14); setHidden(true); }} aria-label="لاحقاً"><X size={16}/></button></div>
    </section>
    {open && <InstallSteps onClose={() => setOpen(false)} onDone={() => { snooze(365); setHidden(true); setOpen(false); }}/>}
  </>;
}

function InstallSteps({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const p = platform(); const inApp = inAppBrowser();
  const steps = p === 'ios'
    ? [[<Share size={22}/>, 'اضغط زر المشاركة', 'في أسفل Safari (المربع وفوقه سهم).'], [<Plus size={22}/>, 'اختر «إضافة إلى الشاشة الرئيسية»', 'مرّر القائمة للأسفل إذا لم تظهر.'], [<RatioMark size={24} color="currentColor"/>, 'اضغط «إضافة»', 'ستجد أيقونة ريشيو على شاشتك الرئيسية.']]
    : [[<span className="dots3">⋮</span>, 'اضغط قائمة المتصفح', 'النقاط الثلاث أعلى أو أسفل المتصفح.'], [<Plus size={22}/>, 'اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»', ''], [<RatioMark size={24} color="currentColor"/>, 'أكّد التثبيت', 'ستجد أيقونة ريشيو على شاشتك الرئيسية.']];
  return createPortal(<div className="install-sheet" role="dialog" aria-label="طريقة التثبيت" dir="rtl" onClick={onClose}>
    <div className="is-body" onClick={e => e.stopPropagation()}>
      <button type="button" className="is-x" onClick={onClose} aria-label="إغلاق"><X size={18}/></button>
      <h2>ثبّت ريشيو في 3 خطوات</h2>
      {inApp && <div className="is-warn">أنت تفتح الموقع من داخل تطبيق آخر (مثل واتساب). افتح الرابط في {p === 'ios' ? 'Safari' : 'Chrome'} أولاً، ثم ثبّته.</div>}
      <ol>{steps.map(([ico, t, d], i) => <li key={i}><span className="is-num">{i + 1}</span><span className="is-ico">{ico}</span><div><b>{t as string}</b>{d && <small>{d as string}</small>}</div></li>)}</ol>
      <button type="button" className="button button-primary full-button" onClick={onDone}>تم التثبيت</button>
    </div>
  </div>, document.body);
}
