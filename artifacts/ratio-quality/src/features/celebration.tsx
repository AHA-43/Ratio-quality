import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Share2 } from 'lucide-react';
import type { Inspection } from '../data';
import { calculateScore } from '../scoring';
import { Celebrate, CountUp, RatioMark } from './brand-motion';
import { deliver } from './exports';
import { renderBranchCard } from './branch-card';

const MILESTONES = [1, 10, 25, 50, 100, 250];
type Tier = { tone: string; title: string; text: string; party: boolean };
function tierOf(score: number | null, cls: string | null, critical: number): Tier {
  if (critical > 0) return { tone: 'bad', title: 'تم الإرسال', text: 'سُجّل إخفاق حرج. ابدأوا بالبنود الحرجة، المهلة 24 ساعة.', party: false };
  if (cls === 'ممتاز') return { tone: 'good', title: 'نتيجة ممتازة!', text: 'أداء يستحق التقدير. شاركوا النجاح مع الفريق.', party: true };
  if (cls === 'جيد') return { tone: 'ok', title: 'نتيجة جيدة', text: 'قريبون من التميّز. عالجوا الملاحظات القليلة في مواعيدها.', party: true };
  if (cls === 'يحتاج تحسين') return { tone: 'warn', title: 'تم الإرسال', text: 'الخطوة التالية: الإجراءات التصحيحية ثم زيارة متابعة.', party: false };
  return { tone: score === null ? 'ok' : 'bad', title: 'تم الإرسال', text: 'النتيجة تحتاج تدخلاً عاجلاً. ابدأوا بالبنود الأعلى خطورة.', party: false };
}

/** Full-screen moment after submitting a visit: score count-up, tier message, milestone, share card. */
export function SubmitCelebration({ inspection, visitCount, onClose }: { inspection: Inspection; visitCount: number; onClose: () => void }) {
  const s = calculateScore(inspection.questionSnapshot, inspection.answers); const t = tierOf(s.score, s.classification, s.criticalFailures);
  const [fire, setFire] = useState(0); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { const k = window.setTimeout(() => setFire(1), 900); return () => window.clearTimeout(k); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const milestone = MILESTONES.includes(visitCount) ? (visitCount === 1 ? 'أول زيارة لك! بداية رائعة.' : `زيارتك رقم ${visitCount}. شكراً على الجهد.`) : '';
  const share = async () => {
    setBusy(true); setErr('');
    try { const blob = await renderBranchCard(inspection); await deliver(blob, `Ratio-card-${inspection.branchCode || 'BRANCH'}-${inspection.date.slice(0, 10)}.png`, typeof navigator !== 'undefined' && 'share' in navigator); }
    catch { setErr('تعذّر إنشاء البطاقة.'); } setBusy(false);
  };
  return createPortal(<div className={`sc sc-${t.tone}`} role="dialog" aria-label="تم إرسال الزيارة" dir="rtl" onClick={onClose}>
    {t.party && <Celebrate fire={fire}/>}
    <div className="sc-body" onClick={e => e.stopPropagation()}>
      <RatioMark size={64} color="#fff" className="slow"/>
      <h2>{t.title}</h2>
      <div className="sc-score"><strong><CountUp to={s.score} suffix="%" duration={1400}/></strong><em>{s.criticalFailures ? 'غير مقبول' : s.classification ?? ''}</em></div>
      <p className="sc-branch">{inspection.branchName}</p>
      <p className="sc-text">{t.text}</p>
      {milestone && <div className="sc-mile">🏅 {milestone}</div>}
      <div className="sc-actions"><button type="button" className="sc-main" onClick={onClose} autoFocus>عرض التقرير</button><button type="button" className="sc-ghost" onClick={share} disabled={busy}><Share2 size={17}/> {busy ? 'جارٍ الإنشاء…' : 'مشاركة بطاقة الفرع'}</button></div>
      {err && <small className="sc-err">{err}</small>}
    </div>
  </div>, document.body);
}
