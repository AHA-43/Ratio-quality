import { useEffect, useState } from 'react';

/* Helpers for the phone-first inspection experience. */

export function useMedia(query: string) {
  const get = () => typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false;
  const [m, setM] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query); const on = () => setM(mq.matches);
    on(); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

/** Keeps the screen on while an inspection is being filled (re-acquired when the tab returns). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    type Sentinel = { release: () => Promise<void> };
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock;
    if (!wl) return;
    let s: Sentinel | null = null; let gone = false;
    const get = () => { if (document.visibilityState === 'visible') wl.request('screen').then(x => { if (gone) x.release().catch(() => {}); else s = x; }).catch(() => {}); };
    get(); document.addEventListener('visibilitychange', get);
    return () => { gone = true; document.removeEventListener('visibilitychange', get); s?.release().catch(() => {}); };
  }, [active]);
}

/** True while a text field has focus (the on-screen keyboard is up) so a fixed bar can step aside. */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'TEXTAREA' || (t instanceof HTMLInputElement && ['text', 'search', 'email', 'url', 'tel'].includes(t.type)));
    const on = (e: FocusEvent) => setOpen(isField(e.target)); const off = () => setOpen(false);
    window.addEventListener('focusin', on); window.addEventListener('focusout', off);
    return () => { window.removeEventListener('focusin', on); window.removeEventListener('focusout', off); };
  }, []);
  return open;
}

/** Tap-to-append phrases, so common findings take one tap instead of typing. */
const OBS = ['غير نظيف', 'غير متوفر', 'تالف أو يحتاج صيانة', 'خارج النطاق المعتمد', 'لا يوجد توثيق', 'لم يلتزم الموظف بالإجراء', 'تم تنبيه الموظف', 'ملاحظة متكررة'];
const REC = ['تنظيف فوري', 'إصلاح أو استبدال', 'تدريب الموظف', 'معايرة الجهاز', 'توثيق في السجل', 'متابعة خلال 72 ساعة'];
export function QuickPhrases({ kind, value, onChange }: { kind: 'observation' | 'recommendation'; value: string; onChange: (next: string) => void }) {
  const list = kind === 'observation' ? OBS : REC;
  const add = (p: string) => {
    if (value.includes(p)) return;
    onChange(value.trim() ? `${value.trim()}${/[.،؛]$/.test(value.trim()) ? '' : '،'} ${p}` : p);
    try { navigator.vibrate?.(8); } catch { /* ignore */ }
  };
  return <div className="quick-phrases" role="group" aria-label="عبارات جاهزة">{list.map(p => <button type="button" key={p} className={value.includes(p) ? 'used' : ''} onClick={() => add(p)}>{p}</button>)}</div>;
}

type Q = { id: number; section: string };
/** One segment per section: tap to jump, fill shows progress, red dot when the section has findings. */
export function SectionProgress({ questions, values, current, onJump }: { questions: Q[]; values: Record<number, string | null | undefined>; current: string; onJump: (qid: number) => void }) {
  const sections = [...new Set(questions.map(q => q.section))];
  return <div className="section-progress" role="tablist" aria-label="تقدم الأقسام">{sections.map((s, i) => {
    const qs = questions.filter(q => q.section === s); const done = qs.filter(q => values[q.id] != null).length; const fails = qs.filter(q => values[q.id] === 'fail').length;
    const firstOpen = qs.find(q => values[q.id] == null) ?? qs[0];
    return <button type="button" key={s} role="tab" aria-selected={s === current} className={`sp-seg ${s === current ? 'cur' : ''} ${done === qs.length ? 'done' : ''}`} onClick={() => onJump(firstOpen.id)}>
      <span className="sp-bar"><i style={{ width: `${(done / qs.length) * 100}%` }}/></span>
      <span className="sp-name"><b>{String(i + 1).padStart(2, '0')}</b> {s}</span>
      <small>{done}/{qs.length}{fails ? <em> · {fails} ⚠</em> : null}</small>
    </button>;
  })}</div>;
}
