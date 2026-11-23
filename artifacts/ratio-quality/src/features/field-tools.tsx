import { useEffect, useRef, useState } from 'react';

/* ---------- Arabic voice dictation (Web Speech API; on-device/browser service, nothing stored by us) ---------- */
type Rec = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> ; resultIndex: number }) => void; onend: () => void; onerror: () => void };
const RecCtor = (): (new () => Rec) | undefined => { const w = window as unknown as Record<string, unknown>; return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as never; };
export const dictationSupported = () => typeof window !== 'undefined' && Boolean(RecCtor());

export function DictateButton({ onText, label = 'إملاء صوتي' }: { onText: (text: string) => void; label?: string }) {
  const [on, setOn] = useState(false);
  const rec = useRef<Rec | null>(null);
  useEffect(() => () => rec.current?.stop(), []);
  if (!dictationSupported()) return null;
  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    const R = RecCtor()!; const r = new R();
    r.lang = 'ar-SA'; r.interimResults = false; r.continuous = true;
    r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim()); };
    r.onend = () => setOn(false); r.onerror = () => setOn(false);
    rec.current = r; r.start(); setOn(true);
    try { navigator.vibrate?.(10); } catch { /* ignore */ }
  };
  return <button type="button" className={`dictate ${on ? 'on' : ''}`} onClick={toggle} aria-pressed={on} aria-label={label}>
    <span className="mic" aria-hidden>🎙</span>{on ? 'جارٍ الاستماع… اضغط للإيقاف' : label}
  </button>;
}

/* ---------- first-run coach marks for field mode ---------- */
const TIPS = [
  { t: 'إجابة بإبهام واحد', d: 'اضغط «مطابق» وينتقل التطبيق للبند التالي تلقائياً. أخطأت؟ اضغط «تراجع».' },
  { t: 'خريطة الزيارة', d: 'الشريط الملوّن يُظهر كل البنود: أخضر مطابق، أحمر غير مطابق. اضغط أي خانة للانتقال إليها.' },
  { t: 'اسحب للتنقل', d: 'اسحب الشاشة يميناً أو يساراً للبند السابق أو التالي. على الكمبيوتر: الأرقام 1 و2 و3 والأسهم.' },
  { t: 'تكلّم بدل الكتابة', d: 'زر الإملاء الصوتي يكتب ملاحظتك بالعربية وأنت واقف خلف البار.' },
];
export function CoachMarks() {
  const [i, setI] = useState<number>(() => { try { return localStorage.getItem('rq-coach') === 'done' ? -1 : 0; } catch { return -1; } });
  if (i < 0) return null;
  const done = () => { try { localStorage.setItem('rq-coach', 'done'); } catch { /* ignore */ } setI(-1); };
  const tip = TIPS[i];
  return <div className="coach" role="dialog" aria-label="نصائح وضع الميدان">
    <div className="coach-card">
      <small>{i + 1} / {TIPS.length}</small><b>{tip.t}</b><p>{tip.d}</p>
      <div className="coach-dots">{TIPS.map((_, k) => <i key={k} className={k === i ? 'on' : ''}/>)}</div>
      <div className="coach-actions"><button onClick={done}>تخطّي</button><button className="primary" onClick={() => i < TIPS.length - 1 ? setI(i + 1) : done()}>{i < TIPS.length - 1 ? 'التالي' : 'ابدأ الفحص'}</button></div>
    </div>
  </div>;
}

/* ---------- desktop / tablet-keyboard shortcuts ---------- */
export function useShortcuts(map: Record<string, () => void>, enabled = true) {
  const ref = useRef(map); ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input,textarea,select,[contenteditable]')) return;
      const fn = ref.current[e.key]; if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [enabled]);
}
