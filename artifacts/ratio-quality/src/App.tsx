import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, useRoute, Router as WouterRouter, Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form } from '@/components/ui/form';
import { createPortal } from 'react-dom';
import { CalendarCheck, GraduationCap, PenLine, Activity, Archive, Camera, MapPin, NotebookPen, SkipForward, ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronLeft, CircleHelp, ClipboardCheck, Clock3, Coffee, FileCheck2, FileText, Gauge, ImagePlus, Info, LayoutDashboard, ListChecks, MoreHorizontal, Pencil, Plus, Printer, Search, Settings, ShieldCheck, SlidersHorizontal, Store, Upload, X } from 'lucide-react';
import { AuthGate } from './AuthGate';
import { cloudEnabled, signOutUser } from './cloud';
import { TASTING_SCORE_IDS } from './checklist';
import { allocateInspectionNumber, applyStandards, audit, canApprove, checklistVersionLabel, isQualityLead, looksAutoNamed, publishStandards, useConfig, useProfile, workflowLabel } from './session';
import { ExportBar, MailHistory } from './features/ExportBar';
import { FacadeCapture, facadeFor } from './features/facade';
import { ApprovalAlert } from './features/approval-alert';
import { CloudUsageCard } from './features/cloud-usage';
import { appVersion, buildDiagnostics, clearErrors, getErrors } from './errorlog';
import { lazyRetry, requestPersistence, useStorageWarning, useUpdateAvailable } from './reliability';
import { useMyPosition, type BranchScore } from './features/position';
const BranchMap = lazyRetry(() => import('./features/BranchMap').then(m => ({ default: m.BranchMap })));
import { SaudiMap } from './features/SaudiMap';
import { ConflictResolver } from './features/ConflictResolver';
import { Celebrate, CountUp, RIconActions, RIconHome, RIconReports, RIconSettings, RIconVisits, ScoreRing, useReveal } from './features/brand-motion';
import { AskName, CoachMarks, DictateButton, useShortcuts, WritingHelper } from './features/field-tools';
import { explainScore, nameKey } from './features/text';
const ExecutivePage = lazyRetry(() => import('./features/executive').then(m => ({ default: m.ExecutivePage })));
const PrioritiesPage = lazyRetry(() => import('./features/priorities').then(m => ({ default: m.PrioritiesPage })));
const HomePriorityCard = lazyRetry(() => import('./features/priorities').then(m => ({ default: m.HomePriorityCard })));
import { PhotoAnnotator } from './features/photo-annotator';
import { VisitBrief, repeatQuestions } from './features/visit-brief';
import { SearchPalette, openSearch } from './features/palette';
import { LegacyImportCard } from './features/legacy-import';
import { InstallCard } from './features/install-guide';
import { DisplayMenu, initDisplay } from './features/display';
import { TRAINING_HINTS, trainingQuestions } from './features/training';
import { BeforeAfter } from './features/before-after';
import { SubmitCelebration } from './features/celebration';
import { QuickPhrases, SectionProgress, useKeyboardOpen, useMedia, useWakeLock } from './features/field-bar';
import { branchPos, distanceKm, fmtKm } from './features/geo';
import { isOverdue } from './features/overdue';
const BranchesPage = lazyRetry(() => import('./features/pages').then(m => ({ default: m.BranchesPage })));
const BranchProfile = lazyRetry(() => import('./features/pages').then(m => ({ default: m.BranchProfile })));
const ConfigPage = lazyRetry(() => import('./features/pages').then(m => ({ default: m.ConfigPage })));
const ActionsBoard = lazyRetry(() => import('./features/pages').then(m => ({ default: m.ActionsBoard })));
const AnalyticsPage = lazyRetry(() => import('./features/pages').then(m => ({ default: m.AnalyticsPage })));
const BaristaEvaluation = lazyRetry(() => import('./features/pages').then(m => ({ default: m.BaristaEvaluation })));
const BaristasPage = lazyRetry(() => import('./features/pages').then(m => ({ default: m.BaristasPage })));
const EquipmentPage = lazyRetry(() => import('./features/pages').then(m => ({ default: m.EquipmentPage })));
const UsersPage = lazyRetry(() => import('./features/pages').then(m => ({ default: m.UsersPage })));
import { ApprovalPanel, PreviousVisitCard, RecurringHint, SignatureSection, TastingScores, previousInspection, signaturesComplete } from './features/workflow-ui';
import { type ActionItem, type Answer, type Attachment, type Branch, type Inspection, type Question, QUESTIONS, emptyAnswer, getConflict, onConflict, onDataChange, saveConflict, pendingUploadIds, startLiveSync, remove, syncAll, initializeBranches, list, loadQuestions, newId, put, saveQuestions } from './data';
import { calculateScore, WEIGHTS } from './scoring';

const queryClient = new QueryClient();
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'صباح الخير' : h < 17 ? 'مساء الخير' : 'مساء النور'; };
if (typeof document !== 'undefined') initDisplay();
const nav = [
  { href: '/', label: 'الرئيسية', icon: RIconHome },
  { href: '/visits', label: 'الزيارات', icon: RIconVisits },
  { href: '/actions', label: 'الإجراءات', icon: RIconActions },
  { href: '/reports', label: 'التقارير', icon: RIconReports },
  { href: '/settings', label: 'الإعدادات', icon: RIconSettings },
];
const moreNav = [
  { href: '/executive', label: 'لوحة الإدارة' },
  { href: '/priorities', label: 'الأولويات وخطة الأسبوع' },
  { href: '/branches', label: 'أداء الفروع' },
  { href: '/analytics', label: 'التحليلات' },
  { href: '/equipment', label: 'المعدات والصيانة' },
  { href: '/baristas', label: 'الباريستا' },
  { href: '/users', label: 'المستخدمون والصلاحيات' },
  { href: '/config', label: 'الأدلة وقوائم البريد' },
];
const types = ['زيارة جودة شاملة', 'فحص جودة القهوة', 'فحص المعدات', 'زيارة متابعة'];
const defaultAnswer = (a?: Answer): Answer => a || emptyAnswer();
const stamp = () => new Date().toISOString();
/** Corrective-action deadlines from the approved checklist: Critical 24h, Major 72h, Minor 7 days. */
const DUE_HOURS = { Critical: 24, Major: 72, Minor: 168 } as const;
const defaultDueDate = (sev: keyof typeof DUE_HOURS) => new Date(Date.now() + DUE_HOURS[sev] * 3600e3).toISOString().slice(0, 10);
const inspectionStartSchema = z.object({
  branchId: z.string().min(1, 'اختر الفرع.'),
  inspector: z.string().trim().min(1, 'اكتب اسم المفتش.'),
  type: z.string().min(1),
  date: z.string().min(1, 'حدد تاريخ ووقت الزيارة.'),
  shift: z.enum(['صباحية', 'مسائية']),
  employees: z.number().int().min(0, 'أدخل عدداً صحيحاً غير سالب.'),
});
type InspectionStartValues = z.infer<typeof inspectionStartSchema>;
const localDateTime = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

const MORE_ICONS: Record<string, typeof Gauge> = { '/executive': Gauge, '/priorities': CalendarCheck, '/branches': Store, '/analytics': Activity, '/equipment': Coffee, '/baristas': Coffee, '/users': ShieldCheck, '/config': FileText, '/settings': Settings };
function MoreSheet({ location, onClose }: { location: string; onClose: () => void }) {
  const items = [...moreNav, ...nav.filter(n => n.href === '/settings')];
  return createPortal(<div className="install-sheet more-sheet" role="dialog" aria-label="المزيد" dir="rtl" onClick={onClose}>
    <div className="is-body" onClick={e => e.stopPropagation()}>
      <button type="button" className="is-x" onClick={onClose} aria-label="إغلاق"><X size={18}/></button>
      <h2>المزيد</h2>
      <div className="more-grid">{items.map(n => { const Icon = MORE_ICONS[n.href] ?? FileText; return <Link key={n.href} href={n.href} onClick={onClose} data-testid={`mobile-nav-${n.href}`} className={location.startsWith(n.href) ? 'on' : ''}><span className="mg-ico"><Icon size={22}/></span><b>{n.label}</b></Link>; })}</div>
    </div></div>, document.body);
}
function usePendingCount() {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!cloudEnabled) return;
    let on = true;
    const run = () => list<Inspection>('inspections').then(l => { if (on) setN(pendingUploadIds(l).length); }).catch(() => {});
    // Event-driven (reading every visit with its photos every few seconds made phones sluggish).
    run(); const t = window.setInterval(run, 20000); const off = onDataChange(run);
    const h = window.setTimeout(run, 1500);
    return () => { on = false; window.clearInterval(t); window.clearTimeout(h); off(); };
  }, []);
  return n;
}

function AppShell({ children }: { children: ReactNode }) {
  const online = useOnline();
  const pendingUploads = usePendingCount();
  useReveal();
  useEffect(() => { if (online && cloudEnabled) syncAll().catch(() => {}); }, [online]);
  // Live: other users' visits/actions arrive as they are saved; plus a catch-up sync whenever the app comes back to the foreground.
  useEffect(() => {
    if (!cloudEnabled) return;
    const stop = startLiveSync();
    let last = Date.now();
    const wake = () => { if (document.visibilityState === 'visible' && navigator.onLine && Date.now() - last > 15000) { last = Date.now(); syncAll().catch(() => {}); } };
    document.addEventListener('visibilitychange', wake); window.addEventListener('focus', wake);
    return () => { stop(); document.removeEventListener('visibilitychange', wake); window.removeEventListener('focus', wake); };
  }, []);
  useEffect(() => {
    requestPersistence();
    // Warm the lazy screens while online so they also open without a connection inside branches.
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 3000));
    idle(() => { if (navigator.onLine) { import('./features/pages').catch(() => {}); import('./features/priorities').catch(() => {}); import('./features/BranchMap').catch(() => {}); } });
  }, []);
  // Retry unsent work while waiting (flaky branch Wi-Fi): every 45s, only when something is pending.
  useEffect(() => { if (!online || !cloudEnabled || !pendingUploads) return; const t = window.setInterval(() => { syncAll().catch(() => {}); }, 45000); return () => window.clearInterval(t); }, [online, pendingUploads > 0]);
  const storageWarn = useStorageWarning(80);
  const updateReady = useUpdateAvailable();
  const [location] = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }, [location]);
  const [mobileMenu, setMobileMenu] = useState(false);
  useEffect(() => { setMobileMenu(false); }, [location]);
  const inMore = [...moreNav, ...nav].some(n => n.href !== '/' && !['/visits', '/actions', '/reports'].includes(n.href) && location.startsWith(n.href));
  return <div dir="rtl" className="app-shell">
    <aside className="side-rail">
      <Link href="/" className="brand-lockup" aria-label="ريشيو للجودة"><img src="/brand/logo-ar-white.png" alt="ريشيو"/><span className="brand-sub">إدارة الجودة</span></Link>
      <div className="rail-label">مساحة العمل</div>
      {nav.map(item => <Link key={item.href} href={item.href} data-testid={`nav-${item.href === '/' ? 'home' : item.href.slice(1)}`} className={`rail-link ${location === item.href ? 'active' : ''}`}><item.icon size={18}/><span>{item.label}</span></Link>)}
      <div className="rail-label">المزيد</div>{moreNav.map(item => <Link key={item.href} href={item.href} className={`rail-link rail-more-link ${location === item.href ? 'active' : ''}`}><span>{item.label}</span></Link>)}<button type="button" className="rail-link rail-more-btn" onClick={() => setMobileMenu(true)} aria-haspopup="dialog" data-testid="rail-more"><MoreHorizontal size={18}/><span>المزيد</span></button><div className="rail-bottom"><div className="device-note"><ShieldCheck size={18}/><span>{cloudEnabled ? 'تُحفظ بياناتك على الجهاز وتُزامن مع حسابك عند توفر الإنترنت' : 'بياناتك محفوظة على هذا الجهاز فقط'}</span></div><span className="rail-version">ريشيو للجودة · 1.0</span></div>
    </aside>
    <div className="main-column">
      <header className="topbar">
        <button className="icon-button menu-toggle" onClick={() => setMobileMenu(!mobileMenu)} aria-label="فتح القائمة" data-testid="button-menu"><MoreHorizontal size={22}/></button>
        <div className="crumb">{nav.find(n => n.href === location)?.label || (location.startsWith('/inspection') ? 'الزيارة الميدانية' : location.startsWith('/reports') ? 'التقرير' : 'مساحة العمل')}</div>
        <div className="topbar-right"><button type="button" className="icon-button search-btn" onClick={openSearch} aria-label="بحث" data-testid="button-search"><Search size={18}/></button><DisplayMenu/>{cloudEnabled ? <span className={`sync-chip ${online ? '' : 'off'}`}><i/>{online ? (pendingUploads ? `جارٍ رفع ${pendingUploads} زيارة…` : 'متصل · تمت المزامنة') : `دون اتصال · محفوظ على الجهاز${pendingUploads ? ` · ${pendingUploads} لم تُرفع` : ''}`}</span> : <span className="local-chip"><span/> محلي على هذا الجهاز</span>}{cloudEnabled ? <button className="avatar" type="button" title="تسجيل الخروج" aria-label="تسجيل الخروج" onClick={() => { if (window.confirm('تسجيل الخروج من الحساب؟ المسودات غير المزامنة تبقى محفوظة على الجهاز.')) signOutUser(); }}>خروج</button> : <span className="avatar">ج</span>}</div>
      </header>
      {updateReady && <div className="update-banner" role="status"><span>تم تحديث التطبيق إلى نسخة أحدث.</span><button type="button" onClick={() => window.location.reload()}>تحديث الآن</button></div>}
      {storageWarn && <div className="storage-banner" role="alert"><b>مساحة جهازك شبه ممتلئة ({storageWarn.pct}%)</b><span>ارفع الزيارات المعلّقة، ثم احذف المسودات القديمة والتجريبية لتفادي فقدان التقدّم.</span></div>}
      {mobileMenu && <MoreSheet location={location} onClose={() => setMobileMenu(false)}/>}
      <AskName/>
      <main className="page-wrap">{children}</main>
      <nav className="bottom-nav" aria-label="التنقل الرئيسي">{nav.filter(n => n.href !== '/settings').map(n => <Link href={n.href} key={n.href} data-testid={`bottom-nav-${n.href === '/' ? 'home' : n.href.slice(1)}`} className={location === n.href ? 'selected' : ''}><span className="nav-ico"><n.icon size={22}/></span><span>{n.label}</span></Link>)}<button type="button" className={`more-tab ${mobileMenu || inMore ? 'selected' : ''}`} onClick={() => setMobileMenu(true)} aria-haspopup="dialog" data-testid="bottom-nav-more"><span className="nav-ico"><MoreHorizontal size={22}/></span><span>المزيد</span></button></nav>
    </div>
  </div>;
}

function PageTitle({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="page-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{detail && <p>{detail}</p>}</div>{action}</div>;
}
function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'outline' | 'danger' }) {
  return <button {...props} className={`button button-${variant} ${className}`}>{children}</button>;
}
function AccountCard() {
  const profile = useProfile(); const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null); const [busy, setBusy] = useState(false);
  if (!cloudEnabled) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (pw.length < 8) { setMsg({ ok: false, t: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.' }); return; }
    if (pw !== pw2) { setMsg({ ok: false, t: 'كلمتا المرور الجديدتان غير متطابقتين.' }); return; }
    setBusy(true);
    try { const { changeMyPassword } = await import('./cloud'); await changeMyPassword(cur, pw); setMsg({ ok: true, t: 'تم تغيير كلمة المرور.' }); setCur(''); setPw(''); setPw2(''); }
    catch (er) { const c = (er as { code?: string }).code ?? ''; setMsg({ ok: false, t: c.includes('wrong-password') || c.includes('invalid-credential') ? 'كلمة المرور الحالية غير صحيحة.' : c.includes('weak') ? 'كلمة المرور الجديدة ضعيفة.' : c.includes('network') ? 'لا يوجد اتصال بالإنترنت.' : 'تعذّر تغيير كلمة المرور. سجّل الخروج ثم ادخل من جديد وحاول.' }); }
    setBusy(false);
  };
  return <Card className="settings-card"><div className="card-heading"><div><span className="eyebrow">حسابي</span><h2>تغيير كلمة المرور</h2></div></div>
    <p className="small-muted" dir="ltr" style={{ textAlign: 'right' }}>{profile?.email}</p>
    <form onSubmit={submit} className="account-form"><label className="field"><span>كلمة المرور الحالية</span><input type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} data-testid="input-pw-current"/></label>
      <label className="field"><span>كلمة المرور الجديدة (8 أحرف أو أكثر)</span><input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} data-testid="input-pw-new"/></label>
      <label className="field"><span>تأكيد كلمة المرور الجديدة</span><input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} data-testid="input-pw-confirm"/></label>
      {msg && <div className={msg.ok ? 'form-ok' : 'form-error'} role="status">{msg.t}</div>}
      <Button type="submit" disabled={busy || !cur || !pw}>{busy ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}</Button></form></Card>;
}
function DiagnosticsCard() {
  const [n, setN] = useState(() => getErrors().length); const [msg, setMsg] = useState('');
  const copy = async () => {
    const text = await buildDiagnostics({ pendingUploads: pendingUploadIds(await list<Inspection>('inspections')).length });
    try { await navigator.clipboard.writeText(text); setMsg('تم النسخ. الصقه في رسالة للدعم.'); } catch { window.prompt('انسخ النص التالي', text); }
  };
  return <Card className="settings-card"><div className="card-heading"><div><span className="eyebrow">الدعم</span><h2>تشخيص التطبيق</h2></div><span className="count-badge">{n} خطأ</span></div>
    <p className="small-muted">النسخة {appVersion()} · إذا واجهت مشكلة اضغط «نسخ التشخيص» وأرسله للدعم. لا يحتوي على بيانات الزيارات.</p>
    <div className="diag-actions"><Button variant="outline" onClick={copy}>نسخ التشخيص</Button>{n > 0 && <Button variant="outline" onClick={() => { clearErrors(); setN(0); }}>مسح السجل</Button>}</div>{msg && <small className="form-ok">{msg}</small>}</Card>;
}
function EmptyState({ icon: Icon = ClipboardCheck, title, text, action }: { icon?: typeof ClipboardCheck; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={24}/></span><h2 className="empty-title">{title}</h2><p>{text}</p>{action}</div>;
}
function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) { return <span className={`status-pill tone-${tone}`}>{children}</span>; }
function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`surface-card ${className}`}>{children}</section>; }

function useLocalData() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [training, setTraining] = useState<Inspection[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const refresh = async () => {
    try {
      const [i, b, a] = await Promise.all([list<Inspection>('inspections'), list<Branch>('branches'), list<ActionItem>('actions')]);
      const sorted = i.sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
      setInspections(sorted.filter(x => !x.training)); setTraining(sorted.filter(x => x.training));
      setBranches(b.sort((x, y) => x.name.localeCompare(y.name, 'ar')));
      setActions(a.sort((x, y) => x.dueDate.localeCompare(y.dueDate)));
      setError('');
    } catch (e) {
      setError('تعذر الوصول إلى التخزين المحلي. تحقق من إعدادات المتصفح ثم أعد المحاولة.');
    } finally { setReady(true); }
  };
  useEffect(() => { initializeBranches().then(refresh).catch(() => { setError('تعذر تهيئة التخزين المحلي.'); setReady(true); }); }, []);
  // Re-read when records arrive from the cloud (another inspector's visit, an approval), debounced.
  useEffect(() => { let t = 0; const off = onDataChange(k => { if (k !== 'cloud') return; window.clearTimeout(t); t = window.setTimeout(() => { refresh(); }, 250); }); return () => { off(); window.clearTimeout(t); }; }, []);
  return { inspections, training, branches, actions, ready, error, refresh };
}

async function startTraining(inspector: string): Promise<string> {
  const id = newId();
  const insp: Inspection = { id, status: 'draft', training: true, branchId: 'training', branchName: 'فرع تجريبي', inspector: inspector || 'مفتش', startedAt: stamp(), checklistVersion: 'training', date: localDateTime().replace('T', ' '), type: 'زيارة تدريبية', shift: 'صباحية', employees: 2, answers: {}, questionSnapshot: trainingQuestions(QUESTIONS).map(q => ({ ...q, measurement: q.measurement ? { ...q.measurement } : undefined, options: q.options ? [...q.options] : undefined })), createdAt: stamp(), updatedAt: stamp() };
  await put('inspections', insp); return id;
}
function TrainingDone() {
  const [score] = useState<string | null>(() => { try { const v = sessionStorage.getItem('rq-training-done'); if (v !== null) sessionStorage.removeItem('rq-training-done'); return v; } catch { return null; } });
  const [open, setOpen] = useState(score !== null);
  if (!open) return null;
  return <div className="training-done" role="status"><Celebrate fire={1}/><span>🎓</span><div><b>أحسنت! أنهيت الزيارة التدريبية</b><small>{score ? `نتيجتك التجريبية ${score}%. ` : ''}لم تُحفظ في الإحصاءات. أنت جاهز للزيارة الحقيقية.</small></div><button type="button" onClick={() => setOpen(false)} aria-label="إغلاق"><X size={16}/></button></div>;
}
function TrainingCard({ data }: { data: ReturnType<typeof useLocalData> }) {
  const profile = useProfile(); const [, go] = useLocation();
  const existing = data.training.find(t => t.status === 'draft');
  const open = async () => { const id = existing?.id ?? await startTraining(profile?.name || ''); await data.refresh(); go(`/inspection/${id}`); };
  return <section className="training-card"><span className="tc-ico"><GraduationCap size={26}/></span><div><b>{existing ? 'أكمل زيارتك التدريبية' : 'جرّب زيارة تدريبية'}</b><small>٣ دقائق على 8 بنود حقيقية مع إرشادات خطوة بخطوة. لا تُحفظ في التقارير ولا الإحصاءات.</small></div><button type="button" onClick={open} data-testid="button-training">{existing ? 'متابعة' : 'ابدأ التدريب'}</button></section>;
}

function HomePage({ data }: { data: ReturnType<typeof useLocalData> }) {
  const drafts = data.inspections.filter(i => i.status === 'draft');
  const finished = data.inspections.filter(i => i.status === 'finalized');
  const openActions = data.actions.filter(a => a.status !== 'مغلق');
  const scores = finished.map(i => calculateScore(i.questionSnapshot, i.answers).score).filter((x): x is number => x !== null);
  const average = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';
  const profile = useProfile();
  const approver = canApprove(profile);
  const latestDraft = [...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const draftPct = latestDraft ? Math.round(Object.values(latestDraft.answers).filter(a => a.value != null).length / Math.max(1, latestDraft.questionSnapshot.length) * 100) : 0;
  const overdue = data.actions.filter(isOverdue).length;
  const awaiting = finished.filter(i => i.workflow === 'submitted').length;
  const returned = drafts.filter(i => i.workflow === 'returned').length;
  return <div className="page-content">
    <InstallCard/>
    <TrainingDone/>
    <div className="today">
      <div className="today-hello"><div><small>{new Date().toLocaleDateString('ar-SA-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })}</small><h1>{greeting()}{profile?.name && !looksAutoNamed(profile) ? `، ${profile.name.split(' ')[0]}` : ''}</h1></div><span className="hello-actions"><Link href="/inspection/new" className="button button-primary" data-testid="button-start-inspection"><Plus size={18}/> زيارة جديدة</Link><Link href="/inspection/new?quick=1" className="button button-soft near-btn" data-testid="button-home-quick"><MapPin size={17}/> أقرب فرع</Link></span></div>
      {latestDraft ? <Link href={`/inspection/${latestDraft.id}`} className="continue-card"><span className="ring" style={{ ['--p' as string]: draftPct }}><b>{draftPct}%</b></span><span><small>{latestDraft.workflow === 'returned' ? 'أُعيدت للتصحيح' : 'زيارة لم تكتمل'}</small><h2>{latestDraft.branchName}</h2><span className="cta">أكمل من حيث توقفت ←</span></span></Link>
        : <Link href="/inspection/new" className="continue-card"><span className="ring" style={{ ['--p' as string]: 0 }}><b>+</b></span><span><small>لا توجد زيارة مفتوحة</small><h2>ابدأ زيارة جودة</h2><span className="cta">اختر الفرع وابدأ الفحص ←</span></span></Link>}
      <div className="attention">
        {overdue > 0 && <Link href="/actions" className="red"><span>إجراءات تصحيحية متأخرة</span><b>{overdue}</b></Link>}
        {awaiting > 0 && <Link href="/reports" className="blue"><span>{approver ? 'تقارير بانتظار اعتمادك' : 'تقارير بانتظار الاعتماد'}</span><b>{awaiting}</b></Link>}
        {returned > 0 && <Link href="/visits" className="amber"><span>زيارات أُعيدت للتصحيح</span><b>{returned}</b></Link>}
      </div>
    </div>
    {data.error && <div className="alert alert-danger">{data.error}<Button variant="outline" onClick={data.refresh}>إعادة المحاولة</Button></div>}
    {data.ready && finished.length < 3 && <TrainingCard data={data}/>}
    {data.ready && finished.length > 0 && <Suspense fallback={null}><HomePriorityCard data={data}/></Suspense>}
    <div className="metric-grid">
      <Card className="metric-card"><span className="metric-icon"><ClipboardCheck size={18}/></span><small>زيارات مكتملة</small><strong data-testid="metric-completed">{finished.length}</strong><span className="metric-caption">{cloudEnabled ? 'متزامنة مع حسابك' : 'محفوظة على هذا الجهاز'}</span></Card>
      <Card className="metric-card"><span className="metric-icon green"><Gauge size={18}/></span><small>متوسط الالتزام</small><strong>{average}{average !== '—' && <em>%</em>}</strong><span className="metric-caption">من الزيارات المكتملة</span></Card>
      <Card className="metric-card"><span className="metric-icon amber"><Clock3 size={18}/></span><small>مسودات الزيارات</small><strong>{drafts.length}</strong><span className="metric-caption">جاهزة للاستكمال</span></Card>
      <Card className="metric-card"><span className="metric-icon red"><ListChecks size={18}/></span><small>إجراءات مفتوحة</small><strong>{openActions.length}</strong><span className="metric-caption">تحتاج إلى متابعة</span></Card>
    </div>
    <div className="dashboard-grid">
      <Card className="dashboard-main"><div className="card-heading"><div><span className="eyebrow">تابع من حيث توقفت</span><h2>الزيارات الأخيرة</h2></div><Link href="/visits" className="text-link">كل الزيارات <ArrowLeft size={15}/></Link></div>
        {!data.ready ? <div className="skeleton-list"><i/><i/><i/></div> : data.inspections.length ? <div className="visit-list">{data.inspections.slice(0, 4).map(i => <InspectionRow key={i.id} inspection={i}/>)}</div> : <EmptyState title="ابدأ أول زيارة ميدانية" text="لن تظهر بيانات أو نتائج حتى تسجل زيارة فعلية." action={<Link href="/inspection/new" className="button button-soft"><Plus size={16}/> بدء زيارة</Link>}/>}
      </Card>
      <Card className="dashboard-side"><div className="card-heading"><div><span className="eyebrow">تحتاج انتباهك</span><h2>الإجراءات المفتوحة</h2></div><Link href="/actions" className="small-arrow" aria-label="عرض الإجراءات المفتوحة"><ChevronLeft size={18}/></Link></div>
        {openActions.length ? <div className="mini-actions">{openActions.slice(0, 4).map(a => <div className="mini-action" key={a.id}><span className={`severity-dot ${a.severity.toLowerCase()}`}/><div><b>{a.title}</b><small>{a.branchName} · الاستحقاق {a.dueDate || 'غير محدد'}</small></div></div>)}</div> : <div className="quiet-empty"><CheckCircle2 size={22}/><span>لا توجد إجراءات مفتوحة حالياً</span></div>}
      </Card>
    </div>
    <Card className="branch-performance"><div className="card-heading"><div><span className="eyebrow">نظرة على الفروع</span><h2>آخر نتائج الالتزام</h2></div><Link href="/settings" className="text-link">إدارة الفروع <ArrowLeft size={15}/></Link></div><div className="branch-performance-grid">{data.branches.filter(b => !b.archived).map(branch => {
      const completed = data.inspections.filter(i => i.branchId === branch.id && i.status === 'finalized').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const result = completed[0] ? calculateScore(completed[0].questionSnapshot, completed[0].answers) : undefined;
      const open = data.actions.filter(a => a.branchName === branch.name && a.status !== 'مغلق').length;
      return <div className="branch-performance-item" key={branch.id}><span className="branch-symbol"><Store size={17}/></span><div><b>{branch.name}{branch.demo && <i>مثال</i>}</b><small>{completed.length} زيارات مكتملة · {open} إجراءات مفتوحة</small></div><strong>{result?.score === null || result?.score === undefined ? '—' : `${result.score}%`}<small>{result?.classification || 'لا توجد نتيجة بعد'}</small></strong></div>;
    })}</div></Card>
    <div className="footnote"><Info size={15}/> لا توجد بيانات تجريبية للزيارات. الفروع الثلاثة المبدئية موسومة كأمثلة ويمكن تعديلها.</div>
  </div>;
}
function InspectionRow({ inspection, onDelete }: { inspection: Inspection; onDelete?: (i: Inspection) => void }) {
  const score = calculateScore(inspection.questionSnapshot, inspection.answers);
  const href = inspection.status === 'finalized' ? `/reports/${inspection.id}` : `/inspection/${inspection.id}`;
  const answered = Object.values(inspection.answers).filter(a => a.value != null).length;
  const total = inspection.questionSnapshot.length;
  const isDraft = inspection.status === 'draft';
  const cls = inspection.imported ? inspection.imported.classification ?? null : score.classification;
  const tone = cls === 'ممتاز' ? 'good' : cls === 'جيد' ? 'ok' : cls === 'يحتاج تحسين' ? 'warn' : cls ? 'bad' : 'none';
  return <div className="visit-row-wrap">
    <Link href={href} className="visit-row" data-testid={`visit-row-${inspection.id}`}>
      <span className="branch-symbol"><Store size={18}/></span>
      <span className="visit-info"><b>{inspection.branchName || 'فرع غير محدد'}</b><small>{inspection.date.slice(0, 16)} · {inspection.inspector}</small>
        <small className="visit-state">{inspection.number ? `${inspection.number} · ` : ''}{workflowLabel(inspection)}</small></span>
      {isDraft
        ? <span className="visit-progress" aria-label={`أُجيب ${answered} من ${total}`}><b>{answered}/{total}</b><i><u style={{ width: `${total ? answered / total * 100 : 0}%` }}/></i></span>
        : inspection.imported ? <span className={`visit-score tone-${tone}`}><b className="legacy-cls">{cls ?? 'سابق'}</b><small>تقرير سابق</small></span> : <span className={`visit-score tone-${tone}`}><b>{score.score ?? '—'}%</b><small>{score.classification}</small></span>}
      <ChevronLeft className="visit-chevron" size={16}/>
    </Link>
    {isDraft && onDelete && <button type="button" className="row-delete" aria-label="حذف المسودة" onClick={() => onDelete(inspection)}>حذف</button>}
  </div>;
}

function VisitsPage({ data }: { data: ReturnType<typeof useLocalData> }) {
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('الكل');
  const [branchId, setBranchId] = useState('الكل');
  const [visitDate, setVisitDate] = useState('');
  const [classification, setClassification] = useState('الكل');
  const activeFilters = [branchId !== 'الكل', Boolean(visitDate), classification !== 'الكل'].filter(Boolean).length;
  const removeDraft = async (i: Inspection) => {
    if (!window.confirm(`حذف مسودة «${i.branchName}» (${i.date.slice(0, 10)})؟ لا يمكن التراجع.`)) return;
    await remove('inspections', i.id); await data.refresh();
  };
  const normalizedQuery = query.trim().toLocaleLowerCase('ar');
  const filtered = data.inspections.filter(i => {
    const score = calculateScore(i.questionSnapshot, i.answers);
    const textMatches = `${i.branchName} ${i.inspector} ${i.type}`.toLocaleLowerCase('ar').includes(normalizedQuery);
    return textMatches
      && (filter === 'الكل' || (filter === 'مسودات' ? i.status === 'draft' : i.status === 'finalized'))
      && (branchId === 'الكل' || i.branchId === branchId)
      && (!visitDate || i.date.startsWith(visitDate))
      && (classification === 'الكل' || score.classification === classification);
  });
  return <div className="page-content"><PageTitle eyebrow="سجل الزيارات" title="الزيارات" detail="ابحث عن زيارة، استكمل مسودة، أو افتح تقريراً." action={<Link href="/inspection/new" className="button button-primary"><Plus size={17}/> زيارة جديدة</Link>}/>
    <Card><div className="toolbar"><label className="search-field"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث بالفرع أو المفتش…" data-testid="input-visit-search"/></label><div className="segmented">{['الكل','مسودات','مكتملة'].map(x => <button key={x} className={filter === x ? 'on' : ''} onClick={() => setFilter(x)} data-testid={`filter-${x}`}>{x}</button>)}</div><button type="button" className={`filter-toggle ${showFilters || activeFilters ? 'on' : ''}`} onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}>تصفية{activeFilters ? <b>{activeFilters}</b> : null}</button></div>
      {showFilters && <div className="history-filters">
        <label className="field"><span>الفرع</span><select value={branchId} onChange={e => setBranchId(e.target.value)} data-testid="filter-branch"><option value="الكل">كل الفروع</option>{data.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="field"><span>التاريخ</span><input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} data-testid="filter-date"/></label>
        <label className="field"><span>التصنيف</span><select value={classification} onChange={e => setClassification(e.target.value)} data-testid="filter-classification"><option>الكل</option><option>ممتاز</option><option>جيد</option><option>يحتاج تحسين</option><option>غير مقبول</option></select></label>
      </div>}
      {!data.ready ? <div className="skeleton-list"><i/><i/><i/></div> : filtered.length ? <div className="visit-list">{filtered.map(i => <InspectionRow key={i.id} inspection={i} onDelete={removeDraft}/>)}</div> : <EmptyState title={query ? 'لا توجد نتائج مطابقة' : 'لا توجد زيارات بعد'} text={query ? 'جرّب البحث بكلمة أخرى أو غيّر عامل التصفية.' : 'ابدأ أول زيارة ميدانية من زر «زيارة جديدة».'} action={!query && <Link href="/inspection/new" className="button button-soft"><Plus size={16}/> بدء زيارة</Link>}/>}
    </Card></div>;
}

function ReportsPage({ data }: { data: ReturnType<typeof useLocalData> }) {
  const reports = data.inspections.filter(i => i.status === 'finalized');
  return <div className="page-content"><PageTitle eyebrow="نتائج قابلة للطباعة" title="التقارير" detail="كل تقرير يعرض لقطة محفوظة من الأسئلة والمعايير وقت الإنهاء."/>
    {reports.length ? <Card><div className="report-list">{reports.map(i => { const result = calculateScore(i.questionSnapshot, i.answers); return <div className="report-row" key={i.id}><span className="report-icon"><FileCheck2 size={19}/></span><div className="report-info"><b>{i.branchName}</b><small>{i.date} · {i.inspector} · {i.type}</small></div>{(() => { const c = i.imported ? i.imported.classification ?? null : result.classification; return <div className={`report-result tone-${c === 'غير مقبول' ? 'bad' : c === 'يحتاج تحسين' ? 'warn' : c === 'جيد' ? 'ok' : 'good'}`}><b>{i.imported ? (c ?? 'سابق') : `${result.score}%`}</b><small>{i.imported ? 'تقرير سابق' : result.classification}</small></div>; })()}<Link href={`/reports/${i.id}`} className="button button-outline button-small" data-testid={`open-report-${i.id}`}>فتح التقرير <ArrowLeft size={14}/></Link></div>; })}</div></Card> : <Card><EmptyState icon={FileText} title="لا توجد تقارير مكتملة" text="بعد إنهاء الزيارة ستجد التقرير هنا، جاهزاً للطباعة من المتصفح." action={<Link href="/inspection/new" className="button button-soft"><Plus size={16}/> بدء زيارة</Link>}/></Card>}</div>;
}

function LegacyBanner({ inspection, findings }: { inspection: Inspection; findings: number }) {
  const m = inspection.imported!; const c = m.counts ?? {};
  return <section className="legacy-banner">
    <div className="lb-head"><span className="eyebrow">تقرير سابق مستورد</span><b>{m.classification ? `التصنيف في التقرير الأصلي: ${m.classification}` : 'بدون تصنيف في التقرير الأصلي'}</b></div>
    <div className="lb-stats">{c.critical != null && <span className="crit">{c.critical} حرجة</span>}{c.major != null && <span className="maj">{c.major} متوسطة</span>}{c.minor != null && <span className="min">{c.minor} بسيطة</span>}<span>{findings} ملاحظة مسجلة</span></div>
    {m.team?.length ? <small>فريق الزيارة: {m.team.join('، ')}</small> : null}
    <small>المصدر: {m.source}{m.unlabeledSeverity ? ` · ${m.unlabeledSeverity} ملاحظة بلا تصنيف خطورة في الأصل (سُجّلت «رئيسية»)` : ''}</small>
    {m.positives?.length ? <div className="lb-block"><b>نقاط إيجابية</b><ul>{m.positives.map((x, k) => <li key={k}><b>{x.title}</b>{x.text ? ` — ${x.text}` : ''}</li>)}</ul></div> : null}
    {m.general?.length ? <details className="lb-block"><summary>الملاحظات الختامية في التقرير الأصلي</summary><p>{m.general.join(' ')}</p></details> : null}
  </section>;
}
function CelebrationGate({ inspection, count }: { inspection: Inspection; count: number }) {
  const [open, setOpen] = useState(() => { try { return sessionStorage.getItem('rq-celebrate') === inspection.id; } catch { return false; } });
  const [banner, setBanner] = useState(open);
  useEffect(() => { if (open) try { sessionStorage.removeItem('rq-celebrate'); } catch { /* ignore */ } }, []);
  return <>{open && <SubmitCelebration inspection={inspection} visitCount={count} onClose={() => setOpen(false)}/>}{banner && !open && <div className="submitted-banner no-print"><b>أُرسلت الزيارة للاعتماد</b><span>رقم الزيارة {inspection.number ?? '—'} · سيصل التقرير لمدير الجودة</span><button type="button" onClick={() => setBanner(false)} aria-label="إغلاق"><X size={14}/></button></div>}</>;
}

function ReportDetail({ data }: { data: ReturnType<typeof useLocalData> }) {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute('/reports/:id');
  const me = useProfile();
  const inspection = match ? data.inspections.find(i => i.id === params?.id) : undefined;
  if (!inspection) return <div className="page-content"><Link href="/reports" className="text-link"><ArrowRight size={15}/> عودة للتقارير</Link><EmptyState title="التقرير غير موجود" text="قد تكون البيانات قد حذفت من هذا الجهاز."/></div>;
  const score = calculateScore(inspection.questionSnapshot, inspection.answers);
  const findings = inspection.questionSnapshot.filter(q => inspection.answers[q.id]?.value === 'fail' || inspection.answers[q.id]?.initialValue === 'fail');
  const sections = [...new Set(inspection.questionSnapshot.map(q => q.section))];
  const fac = facadeFor(inspection, data.inspections);
  const canAddFacade = inspection.workflow !== 'approved' && (inspection.status === 'draft' || canApprove(me));
  const withFacade = fac ? { ...inspection, facade: fac.photo } : inspection;
  return <div className={`page-content report-page ${inspection.imported ? 'is-imported' : ''}`}><div className="report-actions no-print"><Link href="/reports" className="button button-outline"><ArrowRight size={16}/> عودة</Link><ExportBar inspection={withFacade} actions={data.actions.filter(x => x.inspectionId === inspection.id)}/><Link href={`/inspection/${inspection.id}/baristas`} className="button button-outline">تقييم الباريستا</Link></div><article className="print-report">
    <CelebrationGate inspection={inspection} count={data.inspections.filter(x => x.status === 'finalized' && (inspection.inspectorUid ? x.inspectorUid === inspection.inspectorUid : x.inspector === inspection.inspector)).length}/><div className="no-print"><ApprovalPanel inspection={inspection} all={data.inspections} save={async next => { await put('inspections', next); await data.refresh(); }} onAmend={async copy => { await put('inspections', copy); await data.refresh(); setLocation(`/inspection/${copy.id}`); }}/><MailHistory inspectionId={inspection.id}/></div>{canAddFacade && (!fac || fac.fromVisit) && <div className="no-print"><FacadeCapture photo={fac?.photo.data} older={fac?.fromVisit?.date.slice(0, 10)} onPick={async facade => { await put('inspections', { ...inspection, facade, updatedAt: stamp() }); await data.refresh(); }}/></div>}{fac && <figure className="report-facade"><img src={fac.photo.data} alt={`واجهة ${inspection.branchName}`}/><figcaption>{inspection.branchName}{fac.fromVisit ? ` · صورة من زيارة ${fac.fromVisit.date.slice(0, 10)}` : ''}</figcaption></figure>}<header className="print-cover"><div className="report-brand"><img src="/brand/logo-ar-white.png" alt="ريشيو" style={{ height: 38 }}/></div>{inspection.workflow !== 'approved' && <span className="draft-stamp">نسخة غير معتمدة</span>}<span className="report-label">تقرير زيارة جودة</span><h1>{inspection.branchName}</h1><p>{inspection.type} · {inspection.date}</p><div className="report-meta-grid"><span>المفتش <b>{inspection.inspector}</b></span><span>الفترة <b>{inspection.shift}</b></span><span>عدد الموظفين <b>{inspection.employees}</b></span><span>رقم الزيارة <b>{inspection.number ?? inspection.id.slice(-8).toUpperCase()}</b></span><span>رمز الفرع <b>{inspection.branchCode ?? '—'}</b></span><span>الحالة <b>{workflowLabel(inspection)}</b></span></div></header>
    {inspection.imported && <LegacyBanner inspection={inspection} findings={findings.length}/>}
    <div className={`report-score cls-${score.classification === 'غير مقبول' ? 'bad' : score.classification === 'يحتاج تحسين' ? 'warn' : score.classification === 'جيد' ? 'ok' : 'good'}`}><div><small>النتيجة الإجمالية</small><strong><CountUp to={score.score} suffix="%"/></strong><em className="cls-badge">{score.classification}</em><span>{score.classification} · {score.criticalFailures ? 'تجاوز حرج يغيّر التصنيف' : 'النتيجة حسب الأوزان'}</span></div><div className="report-score-note"><b>ملخص النتائج</b><p>{inspection.questionSnapshot.length - findings.length} مطابق · {findings.length} ملاحظة · {inspection.questionSnapshot.length} سؤالاً</p><p>حرج {findings.filter(q => inspection.answers[q.id]?.severity === 'Critical').length} · رئيسي {findings.filter(q => inspection.answers[q.id]?.severity === 'Major').length} · بسيط {findings.filter(q => inspection.answers[q.id]?.severity === 'Minor').length} · متكرر {findings.filter(q => inspection.answers[q.id]?.recurring).length}</p><p>الأوزان: حرج {WEIGHTS.Critical} · رئيسي {WEIGHTS.Major} · بسيط {WEIGHTS.Minor}</p></div></div>
    <section className="exec-summary"><h2 className="report-section-title">الملخص التنفيذي</h2>
      <p className="score-explain">{inspection.imported ? 'تقرير سابق مستورد من ملف: لا توجد نسبة موزونة لأنه لم يُبنَ على قائمة البنود الـ46، والتصنيف المعروض هو تصنيف التقرير الأصلي. ملاحظاته متاحة للمتابعة والمقارنة.' : explainScore(score.score, score.classification, score.criticalFailures)}</p>
      <div className="exec-sections">{sections.map(section => { const qs = inspection.questionSnapshot.filter(q => q.section === section); const r = calculateScore(qs, inspection.answers); const f = qs.filter(q => inspection.answers[q.id]?.value === 'fail' || inspection.answers[q.id]?.initialValue === 'fail').length; return <div key={section} className="exec-row"><span>{section}</span><span className="bar-track"><i className={r.score != null && r.score < 70 ? 'low' : r.score != null && r.score < 90 ? 'mid' : ''} style={{ width: `${r.score ?? 0}%` }}/></span><b>{r.score ?? '—'}%</b><small>{f ? `${f} ملاحظة` : 'لا ملاحظات'}</small></div>; })}</div>
      {findings.length > 0 && <div className="exec-findings">{(['Critical', 'Major', 'Minor'] as const).map(sev => { const list = findings.filter(q => q.severity === sev); return list.length ? <div key={sev} className={`exec-sev ${sev.toLowerCase()}`}><b>{sev === 'Critical' ? 'حرجة' : sev === 'Major' ? 'رئيسية' : 'ثانوية'} ({list.length}) · التصحيح خلال {sev === 'Critical' ? '24 ساعة' : sev === 'Major' ? '72 ساعة' : '7 أيام'}</b>{list.map(q => <span key={q.id}>#{q.legacy ? q.id - 1000 : q.id} {q.title}{inspection.answers[q.id]?.recurring ? ' ↻' : ''}</span>)}</div> : null; })}</div>}
      {inspection.previous && <p className="exec-prev">الزيارة السابقة ({inspection.previous.date.slice(0, 10)}): {inspection.previous.score ?? '—'}% · {inspection.previous.classification ?? '—'}{score.score != null && inspection.previous.score != null ? ` — التغيّر ${score.score - inspection.previous.score >= 0 ? '+' : ''}${(score.score - inspection.previous.score).toFixed(1)} نقطة` : ''}</p>}
    </section>
    <BeforeAfter current={inspection} previous={previousInspection(data.inspections.filter(x => x.date < inspection.date), inspection.branchId, inspection.id)}/>
    <h2 className="report-section-title">النتائج حسب القسم</h2>
    {sections.map(section => <section className="report-section" key={section}><h3>{section}</h3>{inspection.questionSnapshot.filter(q => q.section === section).map(q => { const a = inspection.answers[q.id]; const wasFailed = a.value === 'fail' || a.initialValue === 'fail'; return <div className="report-finding" key={q.id}><span className={`finding-mark ${wasFailed ? 'failed' : a.value === 'na' ? 'na' : 'passed'}`}>{wasFailed ? '!' : a.value === 'na' ? '—' : '✓'}</span><div><b>{q.legacy ? q.id - 1000 : q.id}. {q.title}</b><small>{q.criterion}</small>{wasFailed && <p>{a.observation || 'لم تسجل ملاحظة تفصيلية.'}{a.value !== 'fail' ? (a.correctedDuringVisit ? ` — تم التصحيح خلال الزيارة: ${a.correctionNote || 'تم تسجيل التصحيح.'}` : ' — تم تعديل الحالة، دون تأكيد تسجيل التصحيح. الإخفاق الأولي محفوظ.') : ''}{a.recommendation && ` — التوصية: ${a.recommendation}`}</p>}{a.attachments.filter(img => !img.type.startsWith('video/') || img.data).map(img => <figure className="report-evidence" key={img.id}>{img.type.startsWith('video/') ? <video className="no-print" src={img.data} controls playsInline preload="metadata"/> : <img src={img.data} alt={img.caption || 'دليل مرفق'}/>}{img.caption && <figcaption>{img.caption}</figcaption>}</figure>)}</div><StatusPill tone={a.value === 'fail' ? 'red' : a.value === 'na' ? 'neutral' : 'green'}>{a.value === 'fail' ? 'غير مطابق' : a.value === 'na' ? 'لا ينطبق' : 'مطابق حالياً'}</StatusPill></div>; })}</section>)}
    <h2 className="report-section-title">خطة الإجراءات</h2>{data.actions.filter(a => a.inspectionId === inspection.id).length ? data.actions.filter(a => a.inspectionId === inspection.id).map(a => <div className="report-action" key={a.id}><div><b>{a.title}</b><small>{a.description}</small></div><span>{a.responsible || 'دون مسؤول'} · {a.dueDate || 'دون موعد'} · {a.status}</span></div>) : <p className="muted-text">لا توجد إجراءات مرتبطة بهذه الزيارة.</p>}
    <div className="report-closing"><b>ملاحظة المنهجية</b><p>قائمة الفحص وفق نموذج «قائمة فحص زيارة قسم الجودة» المعتمد (46 بنداً). تُقارن القراءات بوصفات ومعايير التشغيل المعتمدة لدى المنشأة.</p></div>
    {inspection.signatures && <div className="report-signatures"><div><small>توقيع المفتش</small>{inspection.signatures.inspector?.image && <img src={inspection.signatures.inspector.image} alt="توقيع المفتش"/>}<b>{inspection.signatures.inspector?.name}</b><span>{inspection.signatures.inspector?.at?.slice(0, 16).replace('T', ' ')}</span></div><div><small>توقيع مسؤول الفرع</small>{inspection.signatures.branch?.image ? <img src={inspection.signatures.branch.image} alt="توقيع مسؤول الفرع"/> : <em>{inspection.signatures.branch?.declinedReason ? `تعذّر التوقيع: ${inspection.signatures.branch.declinedReason}` : ''}</em>}<b>{inspection.signatures.branch?.name}</b><span>{inspection.signatures.branch?.at?.slice(0, 16).replace('T', ' ')}</span></div></div>}
    {inspection.snapshotHash && <p className="report-hash">بصمة النسخة المعتمدة (SHA-256): {inspection.snapshotHash}</p>}
    </article></div>;
}

const normAr = (v: string) => v.toLowerCase().replace(/[\u064B-\u0652]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
function BranchPicker({ branches, value, onChange, scores = {} }: { branches: Branch[]; value: string; onChange: (id: string) => void; scores?: BranchScore }) {
  const [q, setQ] = useState('');
  const [view, setView] = useState<'list' | 'map' | 'street'>('map');
  const { pos: me, state: geo, locate } = useMyPosition();
  const selected = branches.find(b => b.id === value);
  const list = useMemo(() => {
    const n = normAr(q.trim());
    const rows = branches.filter(b => !n || normAr(b.name).includes(n) || (b.code ?? '').toLowerCase().includes(n))
      .map(b => { const p = branchPos(b.id, b.name); return { b, km: me && p ? distanceKm(me, p) : null }; });
    if (me) rows.sort((x, y) => (x.km ?? 1e9) - (y.km ?? 1e9));
    return rows.slice(0, 80);
  }, [q, branches, me]);
  if (selected) return <div className="branch-selected" data-testid="branch-selected"><div><b>{selected.name}</b>{selected.code && <span className="branch-code">{selected.code}</span>}</div><button type="button" onClick={() => { onChange(''); setQ(''); }}>تغيير</button></div>;
  return <div className="branch-picker">
    <div className="picker-tools">
      <div className="segmented"><button type="button" className={view === 'map' ? 'on' : ''} onClick={() => setView('map')} data-testid="branch-map-toggle">المملكة</button><button type="button" className={view === 'street' ? 'on' : ''} onClick={() => setView('street')}>تفصيلية</button><button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>قائمة</button></div>
      <button type="button" className={`near-me ${me ? 'on' : ''}`} onClick={locate} disabled={geo === 'busy'}>{geo === 'busy' ? 'جارٍ تحديد موقعك…' : me ? '◎ مرتبة حسب الأقرب' : '◎ الأقرب لي'}</button>
    </div>
    {geo === 'denied' && <small className="form-error">تعذّر الوصول لموقعك. فعّل إذن الموقع للمتصفح ثم حاول مجدداً.</small>}
    <div className="branch-search"><Search size={18}/><input className="typed-input" value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث باسم الفرع أو الكود (مثال: HAS.01)" autoComplete="off" data-testid="input-branch-search"/></div>
    {q.trim() || view === 'list' ? <div className="branch-list" role="listbox" aria-label="الفروع">{list.length ? list.map(({ b, km }) => <button type="button" role="option" aria-selected={false} key={b.id} className="branch-option" onClick={() => onChange(b.id)}><span>{b.name}{b.demo ? ' · فرع مثال' : ''}</span><span className="bo-meta">{km != null && <span className="branch-km">{fmtKm(km)}</span>}{b.code && <span className="branch-code">{b.code}</span>}</span></button>) : <div className="branch-empty">لا توجد فروع مطابقة</div>}</div> : view === 'street' ? <Suspense fallback={<div className="map-loading">جارٍ تحميل الخريطة…</div>}><BranchMap branches={branches} scores={scores} onSelect={onChange} me={me}/></Suspense> : <SaudiMap branches={branches} scores={scores} onSelect={onChange} me={me}/>}
  </div>;
}

function StartInspection({ data }: { data: ReturnType<typeof useLocalData> }) {
  const [, setLocation] = useLocation();
  const profile = useProfile();
  const [questions, setQuestions] = useState<Question[]>(QUESTIONS);
  const form = useForm<InspectionStartValues>({
    resolver: zodResolver(inspectionStartSchema),
    defaultValues: { branchId: '', inspector: '', type: types[0], shift: 'صباحية', employees: 2, date: localDateTime() },
  });
  const branchId = form.watch('branchId');
  const type = form.watch('type');
  const [error, setError] = useState('');
  const [facade, setFacade] = useState<Attachment | undefined>();
  useEffect(() => { form.register('branchId'); }, [form]);
  useEffect(() => { if (profile?.name && !form.getValues('inspector')) form.setValue('inspector', profile.name); }, [profile?.name]);
  const sharedCfg = useConfig();
  useEffect(() => { setQuestions(applyStandards(QUESTIONS, sharedCfg)); }, [sharedCfg]);
  const activeBranches = data.branches.filter(b => !b.archived);
  const branchScores = useMemo<BranchScore>(() => { const out: BranchScore = {}; for (const i of [...data.inspections].filter(x => x.status === 'finalized').sort((x, y) => x.date.localeCompare(y.date))) { const r = calculateScore(i.questionSnapshot, i.answers); out[i.branchId] = { score: r.score, cls: r.classification }; } return out; }, [data.inspections]);
  const start = async (values: InspectionStartValues, forcedBranchId?: string) => {
    setError('');
    const bid = forcedBranchId ?? values.branchId;
    const branch = activeBranches.find(b => b.id === bid)!;
    let selectedQuestions = questions;
    if (type === 'فحص جودة القهوة') {
      selectedQuestions = questions.filter(q => q.section === 'جودة القهوة' || q.section === 'تجربة المشروبات والتذوق');
    } else if (type === 'فحص المعدات') {
      selectedQuestions = questions.filter(q => q.section === 'المعدات والجاهزية');
    } else if (type === 'زيارة متابعة') {
      const followUpIds = new Set(data.inspections
        .filter(i => i.branchId === bid && i.status === 'finalized')
        .flatMap(i => Object.entries(i.answers)
          .filter(([, a]) => a.value === 'fail' || a.initialValue === 'fail')
          .map(([questionId]) => Number(questionId))));
      selectedQuestions = questions.filter(q => followUpIds.has(q.id));
      if (!selectedQuestions.length) {
        setError('لا توجد ملاحظات مسجلة لهذا الفرع لمتابعتها بعد. اختر نوع فحص آخر أو أكمل زيارة سابقة.');
        return;
      }
    }
    const id = newId();
    const insp: Inspection = { id, status: 'draft', branchId: bid, branchName: branch.name, branchCode: branch.code, inspectorUid: profile?.uid, inspectorEmail: profile?.email, startedAt: stamp(), checklistVersion: checklistVersionLabel(sharedCfg), inspector: values.inspector.trim(), date: values.date.replace('T', ' '), type: values.type, shift: values.shift, employees: values.employees, answers: {}, questionSnapshot: selectedQuestions.map(q => ({ ...q, measurement: q.measurement ? { ...q.measurement } : undefined, options: q.options ? [...q.options] : undefined })), ...(facade ? { facade } : {}), createdAt: stamp(), updatedAt: stamp() };
    await put('inspections', insp); await data.refresh(); setLocation(`/inspection/${id}`);
  };
  const [locating, setLocating] = useState(false);
  const [nearNote, setNearNote] = useState('');
  const quickStart = () => {
    setError(''); setNearNote('');
    if (!navigator.geolocation) { setError('الجهاز لا يدعم تحديد الموقع. اختر الفرع من الخريطة.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(pos => {
      setLocating(false);
      const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const ranked = activeBranches.map(b => { const p = branchPos(b.id, b.name); return p ? { b, km: distanceKm(me, p), exact: p.exact } : null; }).filter(Boolean).sort((x, y) => x!.km - y!.km) as { b: Branch; km: number; exact: boolean }[];
      const best = ranked[0];
      if (!best) { setError('تعذر تحديد أقرب فرع. اختره من الخريطة.'); return; }
      const name = form.getValues('inspector').trim() || profile?.name?.trim() || '';
      form.setValue('branchId', best.b.id, { shouldValidate: true }); form.setValue('date', localDateTime());
      if (name) form.setValue('inspector', name);
      // Start straight away only when we are clearly standing at the branch and know who is inspecting.
      if (name && best.km <= 0.5 && best.exact) { start({ ...form.getValues(), inspector: name, branchId: best.b.id, date: localDateTime() }, best.b.id); return; }
      setNearNote(`أقرب فرع: ${best.b.name} (${fmtKm(best.km)})${best.km > 0.5 ? ' — لست قريباً بما يكفي للبدء تلقائياً، تأكد من الفرع ثم اضغط «حفظ وبدء الفحص».' : ' — أدخل اسم المفتش ثم ابدأ.'}`);
    }, () => { setLocating(false); setError('لم نتمكن من معرفة موقعك. اسمح للمتصفح بالوصول للموقع أو اختر الفرع من الخريطة.'); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  };
  useEffect(() => { const q = new URLSearchParams(window.location.search); if (q.get('quick') === '1') quickStart(); const b = q.get('branch'); if (b && activeBranches.some(x => x.id === b)) form.setValue('branchId', b, { shouldValidate: true }); /* eslint-disable-next-line */ }, [activeBranches.length]);
  return <div className="page-content narrow-page"><Link href="/" className="back-link"><ArrowRight size={16}/> الرئيسية</Link><PageTitle eyebrow="زيارة جديدة" title="بيانات الجولة" detail="اختر الفرع وتأكد من بيانات الزيارة، ثم ابدأ الفحص. تُحفظ كل إجابة تلقائياً."/>
    <button type="button" className="quick-start" onClick={quickStart} disabled={locating} data-testid="button-quick-start"><span className="qs-ico"><MapPin size={22}/></span><span><b>{locating ? 'جارٍ تحديد موقعك…' : 'ابدأ زيارة في أقرب فرع'}</b><small>ضغطة واحدة: الفرع والتاريخ واسمك تُعبّأ تلقائياً</small></span></button>{nearNote && <div className="alert alert-info quick-note"><Info size={16}/>{nearNote}</div>}
    <Form {...form}><form className="form-card" onSubmit={form.handleSubmit(v => start(v))}><div className="form-grid">
      <div className="field wide"><span>الفرع <em>*</em></span><BranchPicker branches={activeBranches} value={branchId} scores={branchScores} onChange={id => form.setValue('branchId', id, { shouldValidate: true })}/>{form.formState.errors.branchId && <small className="form-error">{form.formState.errors.branchId.message}</small>}{branchId && <PreviousVisitCard prev={previousInspection(data.inspections, branchId)} openActions={data.actions.filter(a => a.status !== 'مغلق' && (a.branchId === branchId || a.branchName === activeBranches.find(b => b.id === branchId)?.name)).length}/>}</div>
      <div className="field wide"><span>صورة الفرع من الخارج</span><FacadeCapture photo={facade?.data} onPick={setFacade}/></div>
      <label className="field wide"><span>اسم المفتش <em>*</em></span><input {...form.register('inspector')} placeholder="الاسم الكامل" data-testid="input-inspector"/>{form.formState.errors.inspector && <small className="form-error">{form.formState.errors.inspector.message}</small>}</label>
      <label className="field wide"><span>نوع الزيارة</span><select {...form.register('type')} data-testid="select-inspection-type">{types.map(t => <option key={t}>{t}</option>)}</select></label>
      <label className="field"><span>تاريخ ووقت الزيارة</span><input type="datetime-local" dir="ltr" className="ltr-date" {...form.register('date')} data-testid="input-inspection-date"/></label>
      <label className="field"><span>الفترة</span><select {...form.register('shift')} data-testid="select-shift"><option>صباحية</option><option>مسائية</option></select></label>
      <label className="field"><span>عدد الموظفين</span><input type="number" min="0" {...form.register('employees', { valueAsNumber: true })} data-testid="input-employees"/>{form.formState.errors.employees && <small className="form-error">{form.formState.errors.employees.message}</small>}</label>
    </div>{error && <div className="form-error">{error}</div>}<div className="form-note"><Info size={17}/><span>{cloudEnabled ? 'تُحفظ المسودة تلقائياً على جهازك وتُزامن مع حسابك عند توفر الإنترنت.' : 'البيانات لا تغادر هذا الجهاز. لا يوجد نسخ احتياطي سحابي أو مزامنة بين الأجهزة.'}</span></div><Button type="submit" className="full-button" data-testid="button-create-inspection">حفظ وبدء الفحص <ArrowLeft size={17}/></Button></form></Form>
  </div>;
}

function InspectionRunner({ data }: { data: ReturnType<typeof useLocalData> }) {
  const [, params] = useRoute('/inspection/:id');
  const id = params?.id || '';
  const inspection = data.inspections.find(i => i.id === id) ?? data.training.find(i => i.id === id);
  const [, setLocation] = useLocation();
  const [answers, setAnswers] = useState<Record<number, Answer>>(inspection?.answers || {});
  const [annot, setAnnot] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState('');
  const [actionForm, setActionForm] = useState<number | null>(null);
  const [responsible, setResponsible] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saved, setSaved] = useState(true);
  const appConfig = useConfig();
  const needsPhoto = (qid: number) => appConfig.photoRequiredOnFail.includes(qid) && answers[qid]?.value === 'fail' && !(answers[qid]?.attachments?.length);
  const [autoAdvance, setAutoAdvance] = useState(() => { try { return localStorage.getItem('rq-auto') !== 'off'; } catch { return true; } });
  const [conflict, setConflict] = useState<Inspection | null>(() => getConflict(id));
  const [toast, setToast] = useState<{ text: string; back: number } | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [signatures, setSignatures] = useState<NonNullable<Inspection['signatures']>>(inspection?.signatures || {});
  const prev = useMemo(() => inspection ? previousInspection(data.inspections, inspection.branchId, inspection.id) : undefined, [data.inspections, inspection?.id]);
  const questions = inspection?.questionSnapshot || QUESTIONS;
  const q = questions[index];
  const answer = defaultAnswer(q ? answers[q.id] : undefined);
  const score = useMemo(() => calculateScore(questions, answers), [questions, answers]);
  useEffect(() => { if (inspection) setAnswers(inspection.answers); }, [inspection?.id]);
  useEffect(() => onConflict(cid => { if (cid === id) setConflict(getConflict(id)); }), [id]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 2600); return () => window.clearTimeout(t); }, [toast]);
  useEffect(() => { if (inspection?.status === 'finalized') setLocation(`/reports/${inspection.id}`); }, [inspection?.id, inspection?.status, setLocation]);
  const inspRef = useRef(inspection); inspRef.current = inspection;
  // What this screen last loaded or saved: tells a live update from another device apart from our own edits.
  const lastSaved = useRef<string>(JSON.stringify(inspection?.answers ?? {}));
  useEffect(() => { lastSaved.current = JSON.stringify(inspection?.answers ?? {}); }, [inspection?.id]);
  useEffect(() => {
    if (!inspection || inspection.status !== 'draft') return;
    const incoming = JSON.stringify(inspection.answers ?? {});
    if (incoming === lastSaved.current) return;
    // Another device changed this draft: take it if nothing is being edited here, otherwise let the inspector merge.
    if (JSON.stringify(answers) === lastSaved.current) { lastSaved.current = incoming; setAnswers(inspection.answers); }
    else saveConflict(inspection);
  }, [inspection?.updatedAt]);
  useEffect(() => {
    if (!inspection || inspection.status !== 'draft') return;
    const snap = JSON.stringify(answers);
    if (snap === lastSaved.current && JSON.stringify(signatures ?? null) === JSON.stringify(inspection.signatures ?? null)) { setSaved(true); return; }
    setSaved(false);
    const timer = window.setTimeout(async () => {
      lastSaved.current = snap;
      await put('inspections', { ...(inspRef.current ?? inspection), answers, signatures, updatedAt: stamp() });
      setSaved(true); data.refresh();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [answers, signatures, inspection?.id]);
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick(n => n + 1), 3000); return () => window.clearInterval(t); }, []);
  const branchOpenActions = data.actions.filter(a => a.status !== 'مغلق' && (a.branchId === inspection?.branchId || a.branchName === inspection?.branchName));
  useEffect(() => {
    if (!inspection || inspection.status !== 'draft' || inspection.training || Object.keys(inspection.answers).length) return;
    try { if (sessionStorage.getItem(`rq-brief-${inspection.id}`) || localStorage.getItem('rq-coach') !== 'done' || localStorage.getItem('rq-brief') === 'off') return; } catch { return; }
    if (prev || branchOpenActions.length) setBriefOpen(true);
  }, [inspection?.id]);
  const closeBrief = () => { setBriefOpen(false); try { sessionStorage.setItem(`rq-brief-${id}`, '1'); } catch { /* ignore */ } };
  const isPhone = useMedia('(max-width: 767px), (max-height: 520px) and (orientation: landscape)');
  const kbOpen = useKeyboardOpen();
  const fieldMode = Boolean(inspection) && inspection?.status === 'draft' && !review;
  useWakeLock(fieldMode);
  useEffect(() => { document.body.classList.toggle('runner-focus', fieldMode && isPhone); return () => document.body.classList.remove('runner-focus'); }, [fieldMode, isPhone]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const submitLock = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [camAuto, setCamAuto] = useState(() => { try { return localStorage.getItem('rq-cam') !== 'off'; } catch { return true; } });
  const [noteOpen, setNoteOpen] = useState(false);
  useEffect(() => { setNoteOpen(false); }, [index]);
  // Hooks must run on every render (also while the draft is still loading on another device).
  useShortcuts({
    '1': () => choose('pass'), '2': () => choose('fail'), '3': () => choose('na'),
    ArrowLeft: () => { goNext(); }, ArrowRight: () => { if (index > 0) { setIndex(index - 1); setMessage(''); } },
    Enter: () => { goNext(); },
  }, Boolean(inspection) && !review && inspection?.status === 'draft');
  if (!inspection) return <div className="page-content"><EmptyState title="المسودة غير موجودة" text="قد تكون حذفت أو استوردت على جهاز آخر." action={<Link href="/visits" className="button button-soft">العودة للزيارات</Link>}/></div>;
  const update = (patch: Partial<Answer>, questionId = q.id) => setAnswers(old => {
    const previous = defaultAnswer(old[questionId]);
    const next = { ...previous, ...patch };
    if (patch.value === 'fail' && previous.initialValue !== 'fail') next.initialValue = 'fail';
    return { ...old, [questionId]: next };
  });
  const goNext = () => {
    if (answer.value === null) { setMessage('اختر نتيجة السؤال قبل المتابعة.'); return false; }
    if (answer.value === 'fail' && !answer.observation.trim()) { setMessage('أضف وصف الملاحظة قبل الانتقال.'); return false; }
    if (needsPhoto(q.id)) { setMessage('هذا البند يتطلب صورة دليل عند عدم المطابقة.'); return false; }
    if (index < questions.length - 1) { setIndex(index + 1); setMessage(''); } else setReview(true);
    return true;
  };
  const choose = (value: 'pass' | 'fail' | 'na') => {
    update({ value, severity: q.severity }); setMessage('');
    try { navigator.vibrate?.(value === 'fail' ? [18, 40, 18] : 12); } catch { /* unsupported */ }
    if (value === 'fail' && camAuto && inspection.status === 'draft' && !answers[q.id]?.attachments?.length) cameraRef.current?.click();
    if (value !== 'fail' && autoAdvance && inspection.status === 'draft') {
      const from = index;
      window.setTimeout(() => {
        setIndex(cur => cur === from ? Math.min(from + 1, questions.length - 1) : cur);
        if (from === questions.length - 1) setReview(true);
        const nextQ = questions[from + 1];
        const sectionDone = !nextQ || nextQ.section !== q.section;
        const secFails = questions.filter(x => x.section === q.section && (answers[x.id]?.value === 'fail')).length;
        setToast({ text: sectionDone ? `✓ اكتمل قسم «${q.section}»${secFails ? ` · ${secFails} ملاحظة` : ' · بدون ملاحظات'}` : `${value === 'pass' ? '✓ مطابق' : '— لا ينطبق'} · البند ${q.id}`, back: from });
      }, 320);
    }
  };
  const jumpIncomplete = () => {
    const n = questions.length;
    for (let k = 1; k <= n; k++) { const i = (index + k) % n; if (answers[questions[i].id]?.value == null) { setIndex(i); setMessage(''); window.scrollTo({ top: 0, behavior: 'smooth' }); return; } }
    setReview(true);
  };
  const onTouchStart = (e: React.TouchEvent) => { const t = e.target as HTMLElement; if (t.closest('textarea,input,canvas,select,.heat-strip')) { touch.current = null; return; } touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y; touch.current = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 60) return;
    if (dx < 0) goNext(); else if (index > 0) { setIndex(index - 1); setMessage(''); }
  };
  const answeredQs = questions.filter(x => answers[x.id]?.value != null);
  const liveScore = calculateScore(answeredQs, answers);
  const failMissing = questions.filter(item => answers[item.id]?.value === 'fail' && !answers[item.id]?.observation.trim());
  const photoMissing = questions.filter(item => needsPhoto(item.id));
  const canFinalize = score.score !== null && failMissing.length === 0 && photoMissing.length === 0 && (signaturesComplete(signatures) || Boolean(inspection.training));
  const finalize = async () => {
    if (submitLock.current) return; // ignore a second tap while the first submit is still running
    submitLock.current = true; setSubmitting(true);
    try { await finalizeInner(); } finally { submitLock.current = false; setSubmitting(false); }
  };
  const finalizeInner = async () => {
    if (inspection.training) { if (score.unanswered.length) { setMessage(`أكمل البنود المتبقية (${score.unanswered.length}).`); setReview(false); setIndex(questions.findIndex(x => score.unanswered.includes(x.id))); return; } try { sessionStorage.setItem('rq-training-done', String(score.score ?? '')); } catch { /* ignore */ } await remove('inspections', inspection.id); await data.refresh(); setLocation('/'); return; }
    if (score.unanswered.length) { setMessage(`أكمل الأسئلة المطلوبة أولاً. المتبقي ${score.unanswered.length}.`); setReview(false); setIndex(questions.findIndex(x => score.unanswered.includes(x.id))); return; }
    if (failMissing.length) { setMessage(`أضف وصف الملاحظة للسؤال رقم ${failMissing[0].id}.`); setReview(false); setIndex(questions.findIndex(x => x.id === failMissing[0].id)); return; }
    if (photoMissing.length) { setMessage(`البند ${photoMissing[0].id} يتطلب صورة دليل.`); setReview(false); setIndex(questions.findIndex(x => x.id === photoMissing[0].id)); return; }
    if (!signaturesComplete(signatures)) { setMessage('أكمل توقيع المفتش، واسم وتوقيع مسؤول الفرع (أو سبب تعذّر التوقيع) قبل الإرسال.'); return; }
    const number = inspection.number && !inspection.number.startsWith('LOCAL') ? inspection.number : (await allocateInspectionNumber()) ?? undefined;
    const prevScore = prev ? calculateScore(prev.questionSnapshot, prev.answers) : null;
    await put('inspections', { ...inspection, status: 'finalized', workflow: 'submitted', number, signatures, answers, submittedAt: stamp(), finalizedAt: stamp(), updatedAt: stamp(), questionSnapshot: questions.map(x => ({ ...x })),
      previous: prev ? { inspectionId: prev.id, date: prev.date, score: prevScore?.score ?? null, classification: prevScore?.classification ?? null } : undefined });
    await audit('inspection.submit', 'inspections', inspection.id, { number, score: score.score, classification: score.classification });
    try { sessionStorage.setItem('rq-celebrate', inspection.id); } catch { /* ignore */ }
    setMessage('تم إرسال الزيارة للاعتماد وحفظ لقطة التقرير.'); await data.refresh(); setReview(true);
  };
  const addAction = async (question: Question) => {
    const a = answers[question.id];
    const item: ActionItem = { id: newId(), title: `${question.title} — ${inspection.branchName}`, description: a.observation, branchName: inspection.branchName, branchId: inspection.branchId, questionId: question.id, inspectionId: inspection.id, responsible, dueDate: dueDate || defaultDueDate(question.severity), status: responsible ? 'مُسند' : 'مفتوح', severity: question.severity, recommendation: a.recommendation, recurring: a.recurring, createdAt: stamp(), history: [{ status: responsible ? 'مُسند' : 'مفتوح', at: stamp(), by: inspection.inspector }], evidence:a.attachments.map(item => ({...item})) };
    await put('actions', item); await data.refresh(); setActionForm(null); setMessage('تم إنشاء الإجراء التصحيحي وربطه بالزيارة.');
  };
  const selectPhoto = async (files: FileList | null, autoAnnotate = false) => {
    if (!files) return;
    const readData = (blob: Blob) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(); r.readAsDataURL(blob); });
    // Always compress: keeps evidence readable (max 1600px) and small enough to sync for free (< ~600 KB).
    const toData = async (file: File) => {
      if (!('createImageBitmap' in window)) return readData(file);
      try {
        const bitmap = await createImageBitmap(file);
        let side = 1600, quality = .8, out = '';
        for (let k = 0; k < 6; k++) {
          const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
          const context = canvas.getContext('2d'); if (!context) return readData(file);
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          out = canvas.toDataURL('image/jpeg', quality);
          if (out.length < 600_000) break;
          side = Math.round(side * .8); quality = Math.max(.55, quality - .07);
        }
        bitmap.close();
        return out;
      } catch { return readData(file); }
    };
    const images = await Promise.all([...files].filter(f => f.type.startsWith('image/')).map(async f => ({ id: newId(), name: f.name, type: 'image/jpeg', data: await toData(f), caption: '' })));
    const tooBig = [...files].filter(f => f.type.startsWith('video/') && f.size > 30 * 1024 * 1024);
    if (tooBig.length) setMessage('حجم الفيديو أكبر من 30 ميجابايت. صوّر مقطعاً أقصر (حتى 20 ثانية تقريباً).');
    const videos = await Promise.all([...files].filter(f => f.type.startsWith('video/') && f.size <= 30 * 1024 * 1024).map(async f => ({ id: newId(), name: f.name, type: f.type, data: await readData(f), caption: '' })));
    if (images.length || videos.length) update({ attachments: [...answer.attachments, ...images, ...videos] });
    if (autoAnnotate && images[0]) setAnnot(images[0].id);
  };
  const updateCaption = (attachmentId: string, caption: string) => update({ attachments: answer.attachments.map(img => img.id === attachmentId ? { ...img, caption } : img) });
  const removePhoto = (attachmentId: string) => update({ attachments: answer.attachments.filter(img => img.id !== attachmentId) });
  const sectionGroups = [...new Set(questions.map(x => x.section))];
  const answeredCount = questions.filter(x => answers[x.id]?.value !== null && answers[x.id]?.value !== undefined).length;
  const isFinal = inspection.status === 'finalized';
  return <div className="page-content runner-page">
    {inspection.status === 'draft' && !review && <CoachMarks/>}
    {briefOpen && <VisitBrief inspection={inspection} prev={prev} actions={branchOpenActions} onStart={closeBrief} onRepeat={() => { const first = repeatQuestions(questions, prev)[0]; if (first) setIndex(questions.findIndex(x => x.id === first.id)); closeBrief(); }}/>}
    {inspection.status === 'draft' && conflict && <ConflictResolver mine={answers} theirs={conflict} onResolve={merged => { setConflict(null); setAnswers(merged); }}/>}
    {inspection.amendmentOf && inspection.status === 'draft' && <div className="alert amend-banner">نسخة تصحيحية رقم {inspection.revision} للتقرير المعتمد — السبب: {inspection.amendmentReason}. التقرير الأصلي محفوظ كما هو.</div>}
    {inspection.workflow === 'returned' && <div className="alert alert-danger">أُعيدت هذه الزيارة للتصحيح{inspection.returnedBy ? ` من ${inspection.returnedBy.name}` : ''}: {inspection.returnReason}</div>}
    <div className="runner-top"><Link href="/visits" className="back-link"><ArrowRight size={16}/> الزيارات</Link><Link href={`/inspection/${inspection.id}/baristas`} className="text-link">تقييم الباريستا الفردي</Link><div className="save-state"><span className={saved || isFinal ? 'saved-dot' : 'saving-dot'}/>{isFinal ? 'زيارة مكتملة' : saved ? (cloudEnabled && inspection && pendingUploadIds([inspection]).length ? '✓ محفوظ على الجهاز · بانتظار الرفع' : cloudEnabled ? '✓ محفوظ ومرفوع' : '✓ محفوظ على الجهاز') : 'جارٍ الحفظ…'}</div></div>
    <div className="runner-intro"><div><div className="eyebrow">{inspection.branchName} · {inspection.shift}</div><h1>{inspection.type}</h1><p>{inspection.inspector} <span>·</span> {inspection.date}</p></div><span className="question-counter">{answeredCount}<small> / {questions.length} مكتمل</small></span></div>
    <div className="progress-track"><span style={{ width: `${(answeredCount / questions.length) * 100}%` }}/></div>
    {inspection.status === 'draft' && !inspection.training && !review && (() => { const f = facadeFor(inspection, data.inspections); return (!f || f.fromVisit) && <FacadeCapture compact photo={f?.photo.data} older={f?.fromVisit?.date.slice(0, 10)} onPick={async facade => { await put('inspections', { ...(inspRef.current ?? inspection), answers, signatures, facade, updatedAt: stamp() }); await data.refresh(); }}/>; })()}
    {inspection.training && !review && <div className="training-banner"><b><GraduationCap size={16}/> زيارة تدريبية</b><span>{TRAINING_HINTS[Math.min(index, TRAINING_HINTS.length - 1)]}</span><small>لن تُحفظ في التقارير أو الإحصاءات.</small></div>}
    {message && <div className="alert alert-info"><Info size={16}/>{message}<button onClick={() => setMessage('')} aria-label="إغلاق"><X size={16}/></button></div>}
    {review ? <div className="review-layout"><Card className="review-summary"><span className="eyebrow">مراجعة قبل الإنهاء</span><h2>{isFinal ? 'تم إنهاء الزيارة' : 'ملخص الزيارة'}</h2><ScoreRing score={score.score} label={score.classification || 'غير مكتمل'} tone={score.classification === 'غير مقبول' ? 'bad' : score.classification === 'يحتاج تحسين' ? 'warn' : score.classification === 'جيد' ? 'ok' : score.classification ? 'good' : 'navy'}/><p className="score-explain">{explainScore(score.score, score.classification, score.criticalFailures)}</p><div className="score-key">{score.criticalFailures ? <span className="text-red">{score.criticalFailures} إخفاق حرج — التصنيف غير مقبول</span> : 'التصنيف يعتمد على النتيجة والأوزان'}</div><div className="summary-counts"><span><i className="dot-green"/> مطابق حالياً <b>{questions.filter(x => answers[x.id]?.value === 'pass').length}</b></span><span><i className="dot-red"/> غير مطابق حالياً <b>{questions.filter(x => answers[x.id]?.value === 'fail').length}</b></span><span><i className="dot-muted"/> لا ينطبق <b>{questions.filter(x => answers[x.id]?.value === 'na').length}</b></span></div><div className="severity-summary"><span>حرج محفوظ <b>{questions.filter(x => (answers[x.id]?.value === 'fail' || answers[x.id]?.initialValue === 'fail') && answers[x.id]?.severity === 'Critical').length}</b></span><span>رئيسي محفوظ <b>{questions.filter(x => (answers[x.id]?.value === 'fail' || answers[x.id]?.initialValue === 'fail') && answers[x.id]?.severity === 'Major').length}</b></span><span>بسيط محفوظ <b>{questions.filter(x => (answers[x.id]?.value === 'fail' || answers[x.id]?.initialValue === 'fail') && answers[x.id]?.severity === 'Minor').length}</b></span><span>متكرر <b>{questions.filter(x => (answers[x.id]?.value === 'fail' || answers[x.id]?.initialValue === 'fail') && answers[x.id]?.recurring).length}</b></span></div>{!inspection.training && <SignatureSection value={signatures} onChange={setSignatures} inspectorName={inspection.inspector} disabled={isFinal}/>}{!isFinal && <Button className="full-button" disabled={!canFinalize || submitting} onClick={finalize} data-testid="button-finalize"><CheckCircle2 size={17}/> {inspection.training ? 'إنهاء التدريب' : 'إرسال للاعتماد'}</Button>}{isFinal && <Link className="button button-primary full-button" href={`/reports/${id}`}>فتح التقرير <ArrowLeft size={16}/></Link>}<Button variant="outline" className="full-button" onClick={() => setReview(false)}>{isFinal ? 'العودة للملخص' : 'العودة للفحص'}</Button>{!canFinalize && !isFinal && <p className="validation-hint">يلزم الإجابة عن جميع الأسئلة، وإضافة ملاحظة لكل إخفاق، وإكمال التوقيعات قبل الإرسال.</p>}</Card>
       <div className="review-sections">{sectionGroups.map(section => <Card key={section} className="review-section-card"><div className="card-heading"><h3>{section}</h3><span>{questions.filter(x => x.section === section).filter(x => answers[x.id]?.value === 'fail' || answers[x.id]?.initialValue === 'fail').length} ملاحظة</span></div>{questions.filter(x => x.section === section).map(item => { const a = defaultAnswer(answers[item.id]); const failedInitially = a.value === 'fail' || a.initialValue === 'fail'; return <button className="review-question" key={item.id} disabled={isFinal} onClick={() => { setIndex(questions.findIndex(x => x.id === item.id)); setReview(false); }}><span className={`finding-mark ${failedInitially ? 'failed' : a.value === 'na' ? 'na' : a.value === 'pass' ? 'passed' : 'empty'}`}>{failedInitially ? '!' : a.value === 'pass' ? '✓' : a.value === 'na' ? '—' : '·'}</span><span>{item.id}. {item.title}</span><ChevronLeft size={15}/></button>; })}</Card>)}</div></div> :
    <div className="inspection-layout"><aside className="section-sidebar"><span className="eyebrow">أقسام الفحص</span>{sectionGroups.map((section, sIndex) => <button key={section} className={`section-jump ${q?.section === section ? 'current' : ''}`} onClick={() => setIndex(questions.findIndex(item => item.section === section))} data-testid={`jump-section-${sIndex}`}><span className="section-number">{String(sIndex + 1).padStart(2, '0')}</span><span>{section}</span><small>{questions.filter(x => x.section === section && answers[x.id]?.value != null).length}/{questions.filter(x => x.section === section).length}</small></button>)}<button className="review-link" onClick={() => setReview(true)}><FileCheck2 size={16}/> مراجعة الزيارة</button></aside>
    <div className="question-column" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="field-hud">
        <div className="hud-score"><small>النتيجة حتى الآن</small><b>{liveScore.score === null ? '—' : `${liveScore.score}%`}</b>{liveScore.criticalFailures > 0 && <em>إخفاق حرج</em>}</div>
        <button type="button" className={`hud-auto ${autoAdvance ? 'on' : ''}`} onClick={() => { const v = !autoAdvance; setAutoAdvance(v); try { localStorage.setItem('rq-auto', v ? 'on' : 'off'); } catch { /* ignore */ } }} aria-pressed={autoAdvance}>{autoAdvance ? 'انتقال تلقائي ✓' : 'انتقال تلقائي'}</button>
        <button type="button" className={`hud-auto ${camAuto ? 'on' : ''}`} onClick={() => { const v = !camAuto; setCamAuto(v); try { localStorage.setItem('rq-cam', v ? 'on' : 'off'); } catch { /* ignore */ } }} aria-pressed={camAuto}>{camAuto ? 'كاميرا تلقائية ✓' : 'كاميرا تلقائية'}</button>
      </div>
      <SectionProgress questions={questions} values={Object.fromEntries(questions.map(x => [x.id, answers[x.id]?.value as string | null | undefined])) as Record<number, string | null | undefined>} current={q.section} onJump={qid => { setIndex(questions.findIndex(y => y.id === qid)); setMessage(''); }}/>
      <div className="heat-strip" aria-label="خريطة الزيارة">{sectionGroups.map(section => <div className="heat-group" key={section} title={section}>{questions.filter(x => x.section === section).map(x => { const v = answers[x.id]?.value; return <button type="button" key={x.id} aria-label={`البند ${x.id}`} onClick={() => { setIndex(questions.findIndex(y => y.id === x.id)); setMessage(''); }} className={`heat ${v === 'pass' ? 'p' : v === 'fail' ? 'f' : v === 'na' ? 'n' : ''} ${x.id === q.id ? 'cur' : ''} ${x.severity === 'Critical' ? 'crit' : ''}`}/>; })}</div>)}</div>
      <div className="question-breadcrumb"><span>{q?.section}</span><span>السؤال {index + 1} من {questions.length} · اسحب للتنقل</span></div><Card className="question-card"><div className="question-number">{String(q.id).padStart(2, '0')}<span> / {questions.length}</span></div><h2>{q.title}</h2><div className={`sev-line ${q.severity.toLowerCase()}`}><span>{q.severity === 'Critical' ? 'حرج' : q.severity === 'Major' ? 'رئيسي' : 'ثانوي'}</span>وزن {WEIGHTS[q.severity]} · التصحيح خلال {q.severity === 'Critical' ? '24 ساعة' : q.severity === 'Major' ? '72 ساعة' : '7 أيام'}{q.severity === 'Critical' && <b> · الإخفاق يجعل الزيارة غير مقبولة</b>}</div>
      {q.measurement && (() => { const hasRange = q.measurement.min !== undefined && q.measurement.max !== undefined; return <div className="measurement-box"><div><span>النطاق المعتمد <small>(وفق نموذج الفحص)</small></span><b>{hasRange ? `${q.measurement.min} – ${q.measurement.max} ${q.measurement.unit}` : `لم يُحدَّد معيار · الوحدة ${q.measurement.unit}`}</b></div><div><span>القراءة الفعلية</span><label><input type="number" inputMode="decimal" value={answer.actual ?? ''} onChange={e => update({ actual: e.target.value === '' ? undefined : Number(e.target.value) })} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} placeholder="—" data-testid={`input-measure-${q.id}`}/><small>{q.measurement.unit}</small></label></div>{hasRange && answer.actual !== undefined && <div className={`measure-check ${answer.actual >= q.measurement.min! && answer.actual <= q.measurement.max! ? 'within' : 'outside'}`} data-testid={`measure-check-${q.id}`}>{answer.actual >= q.measurement.min! && answer.actual <= q.measurement.max! ? 'ضمن النطاق' : 'خارج النطاق'} · مقارنة بالمعيار المعتمد</div>}{hasRange && answer.actual !== undefined && (answer.actual < q.measurement.min! || answer.actual > q.measurement.max!) && answer.value !== 'fail' && <div className="nudge"><span>القراءة خارج النطاق المعتمد. هل البند غير مطابق؟</span><button type="button" onClick={() => choose('fail')}>تسجيل «غير مطابق»</button></div>}</div>; })()}
      {q.inputType && q.inputType !== 'status' && <div className="typed-response"><div className="answer-label">قراءة إضافية <small>اختياري</small></div>{q.inputType === 'numeric' && !q.measurement && <input className="typed-input" type="number" inputMode="decimal" value={answer.entry as string || ''} onChange={e => update({ entry:e.target.value })} placeholder="أدخل القراءة" data-testid={`input-numeric-${q.id}`}/>}
        {q.inputType === 'text' && <textarea className="typed-input typed-text" value={answer.entry as string || ''} onChange={e => update({ entry:e.target.value })} placeholder="اكتب التفاصيل…" data-testid={`input-text-${q.id}`}/>}
        {q.inputType === 'single-choice' && <select className="typed-input" value={answer.entry as string || ''} onChange={e => update({ entry:e.target.value })} data-testid={`input-choice-${q.id}`}><option value="">اختر إجابة</option>{(q.options?.length ? q.options : ['خيار ١','خيار ٢','خيار ٣']).map(o => <option key={o}>{o}</option>)}</select>}
        {q.inputType === 'multi-choice' && <div className="multi-options">{(q.options?.length ? q.options : ['خيار ١','خيار ٢','خيار ٣']).map(o => { const selected = Array.isArray(answer.entry) ? answer.entry : []; return <label key={o}><input type="checkbox" checked={selected.includes(o)} onChange={e => update({ entry:e.target.checked ? [...selected,o] : selected.filter(x => x !== o) })}/>{o}</label>; })}</div>}
        {q.inputType === 'rating' && <div className="rating-options" dir="ltr">{[1,2,3,4,5].map(n => <button type="button" key={n} className={String(answer.entry) === String(n) ? 'selected' : ''} onClick={() => update({ entry:String(n) })} data-testid={`rating-${q.id}-${n}`}>{n}</button>)}</div>}
        {q.inputType === 'date' && <input className="typed-input" type="date" value={answer.entry as string || ''} onChange={e => update({ entry:e.target.value })} data-testid={`input-date-${q.id}`}/>}
        {q.inputType === 'photo' && <p className="typed-help">أرفق صورة من قسم الأدلة أدناه.</p>}
      </div>}
      <div className="answer-label">نتيجة الفحص <em>*</em></div>{!isPhone && <div className="answer-options">
        {[['pass','مطابق','مطابق للمعيار',Check],['fail','غير مطابق','يتطلب متابعة',X],['na','لا ينطبق','يُستبعد من النتيجة',CircleHelp]].map(([value,label,sub,Icon]) => <button type="button" key={value as string} onClick={() => choose(value as 'pass' | 'fail' | 'na')} className={`answer-option ${answer.value === value ? `chosen ${value}` : ''}`} data-testid={`answer-${value}-${q.id}`}><span className="choice-icon"><Icon size={18}/></span><b>{label as string}</b><small>{sub as string}</small></button>)}
      </div>}
      <RecurringHint prev={prev} questionId={q.id} answer={answer} onConfirm={v => update({ recurring: v })}/>{TASTING_SCORE_IDS.includes(q.id) && <TastingScores value={answer.tasting} onChange={t => update({ tasting: t })}/>}{answer.value === 'fail' && <div className="finding-fields"><label className="field"><span>وصف الملاحظة <em>*</em> <DictateButton onText={t => update({ observation: `${answers[q.id]?.observation ? answers[q.id].observation.trim() + ' ' : ''}${t}` })}/></span><textarea autoFocus value={answer.observation} onChange={e => update({ observation: e.target.value })} placeholder="ماذا رأيت؟ وأين؟ ما أثره على العميل أو الجودة؟" data-testid={`input-observation-${q.id}`}/><QuickPhrases kind="observation" value={answer.observation} onChange={v => update({ observation: v })}/><WritingHelper kind="observation" value={answer.observation} onApply={(next, original) => update({ observation: next, textHistory: [...(answer.textHistory ?? []), { field: 'observation', original, accepted: next, at: stamp() }] })}/></label><div className="field-row"><label className="field"><span>درجة الخطورة</span><select value={q.severity} disabled title="الخطورة محددة في قائمة الفحص المعتمدة" data-testid={`select-severity-${q.id}`}><option value="Critical">حرج · وزن 10</option><option value="Major">رئيسي · وزن 5</option><option value="Minor">بسيط · وزن 1</option></select></label><label className="recurring-toggle"><input type="checkbox" checked={answer.recurring} onChange={e => update({ recurring: e.target.checked })} data-testid={`toggle-recurring-${q.id}`}/><span className="fake-check"><Check size={13}/></span><span>ملاحظة متكررة</span></label></div><label className="field"><span>التوصية المقترحة <DictateButton onText={t => update({ recommendation: `${answers[q.id]?.recommendation ? answers[q.id].recommendation.trim() + ' ' : ''}${t}` })}/></span><textarea value={answer.recommendation} onChange={e => update({ recommendation: e.target.value })} placeholder="ما الإجراء الأنسب لمعالجة الملاحظة؟" data-testid={`input-recommendation-${q.id}`}/><QuickPhrases kind="recommendation" value={answer.recommendation} onChange={v => update({ recommendation: v })}/><WritingHelper kind="recommendation" value={answer.recommendation} onApply={(next, original) => update({ recommendation: next, textHistory: [...(answer.textHistory ?? []), { field: 'recommendation', original, accepted: next, at: stamp() }] })}/></label><button className="text-link action-create" onClick={() => setActionForm(actionForm === q.id ? null : q.id)}><Plus size={16}/> إنشاء إجراء تصحيحي</button>{actionForm === q.id && <div className="inline-action-form"><label className="field"><span>المسؤول</span><input value={responsible} onChange={e => setResponsible(e.target.value)} placeholder="اسم المسؤول"/></label><label className="field"><span>تاريخ الاستحقاق</span><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></label><Button onClick={() => addAction(q)} disabled={!answer.observation.trim()}>حفظ الإجراء</Button></div>}</div>}
      {noteOpen && answer.value === 'pass' && <label className="field na-reason"><span>ملاحظة على البند <small>اختياري</small> <DictateButton onText={t => update({ observation: `${answers[q.id]?.observation ? answers[q.id].observation.trim() + ' ' : ''}${t}` })}/></span><textarea autoFocus value={answer.observation} onChange={e => update({ observation: e.target.value })} placeholder="أي تفصيل تحب تسجله على هذا البند…"/></label>}
      {answer.value === 'na' && <label className="field na-reason"><span>سبب عدم الانطباق <small>اختياري</small></span><textarea value={answer.observation} onChange={e => update({ observation: e.target.value })} placeholder="اكتب سبب استبعاد هذا السؤال من الزيارة…"/></label>}
      {answer.initialValue === 'fail' && answer.value === 'pass' && <div className="correction-record"><label className="recurring-toggle"><input type="checkbox" checked={Boolean(answer.correctedDuringVisit)} onChange={e => update({ correctedDuringVisit: e.target.checked })} data-testid={`toggle-corrected-${q.id}`}/><span className="fake-check"><Check size={13}/></span><span>تم تصحيح الملاحظة خلال الزيارة</span></label>{answer.correctedDuringVisit && <label className="field"><span>تفاصيل التصحيح <small>اختياري</small></span><textarea value={answer.correctionNote || ''} onChange={e => update({ correctionNote: e.target.value })} placeholder="ما الذي تم تصحيحه؟"/></label>}</div>}
      <div className="evidence-block">
        <div className="evidence-heading"><span><ImagePlus size={17}/> أدلة مصورة {appConfig.photoRequiredOnFail.includes(q.id) ? <em className="req-photo">مطلوبة عند عدم المطابقة</em> : <small>اختياري</small>}</span><label className="upload-button"><Plus size={16}/> إضافة صورة<input type="file" accept="image/*,video/*" multiple onChange={e => { selectPhoto(e.target.files); e.currentTarget.value = ''; }} data-testid={`input-photo-${q.id}`}/></label></div>
        <p>التقط صورة بالكاميرا أو اختر من المعرض. الفيديو يُحفظ على هذا الجهاز فقط.</p>
        {answer.attachments.length > 0 && <div className="evidence-grid">{answer.attachments.map(img => <div className="evidence-item" key={img.id}>{img.type.startsWith('video/') ? <video src={img.data} controls playsInline preload="metadata"/> : <img src={img.data} alt={img.caption || img.name}/>}{img.type.startsWith('video/') && <span className="video-local">فيديو · على هذا الجهاز</span>}<button onClick={() => removePhoto(img.id)} aria-label="حذف الصورة"><X size={15}/></button>{!img.type.startsWith('video/') && <button type="button" className="ev-annot" onClick={() => setAnnot(img.id)} aria-label="تعليم الصورة"><PenLine size={14}/> {img.annotated ? 'تعديل التعليم' : 'علّم'}</button>}<input value={img.caption} onChange={e => updateCaption(img.id, e.target.value)} placeholder="أضف وصفاً للصورة"/></div>)}</div>}
      </div>
      </Card>{!isPhone && <div className="question-controls"><Button variant="outline" disabled={index === 0} onClick={() => setIndex(Math.max(0,index - 1))}><ArrowRight size={16}/> السابق</Button><span>{index + 1} / {questions.length}</span>{index < questions.length - 1 ? <Button onClick={() => goNext()} data-testid="button-next-question">التالي <ArrowLeft size={16}/></Button> : <Button onClick={() => setReview(true)} data-testid="button-review">مراجعة وإنهاء <FileCheck2 size={16}/></Button>}</div>}</div></div>}
    {fieldMode && <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { selectPhoto(e.target.files, answer.value === 'fail'); e.currentTarget.value = ''; }} data-testid="input-camera"/>}
    {fieldMode && isPhone && createPortal(<div className={`action-bar ${kbOpen ? 'compact' : ''}`} role="region" aria-label="أزرار الإجابة السريعة">
      <div className="ab-answers">{[['pass','مطابق',Check],['fail','غير مطابق',X],['na','لا ينطبق',CircleHelp]].map(([value,label,Icon]) => <button type="button" key={value as string} onClick={() => choose(value as 'pass' | 'fail' | 'na')} className={`ab-btn ${value} ${answer.value === value ? 'chosen' : ''}`} data-testid={`answer-${value}-${q.id}`}><Icon size={22}/><b>{label as string}</b></button>)}</div>
      <div className="ab-tools">
        <button type="button" className="ab-prev" disabled={index === 0} onClick={() => { setIndex(Math.max(0, index - 1)); setMessage(''); }} aria-label="السابق"><ArrowRight size={18}/></button>
        <button type="button" onClick={() => { if (answer.value === 'fail') { document.querySelector<HTMLTextAreaElement>('.finding-fields textarea')?.focus(); } else { if (answer.value == null) { setMessage('اختر النتيجة أولاً ثم أضف ملاحظة.'); return; } setNoteOpen(true); } }}><NotebookPen size={17}/> ملاحظة</button>
        <button type="button" onClick={() => cameraRef.current?.click()} className={answer.attachments.length ? 'has' : ''}><Camera size={17}/> صورة{answer.attachments.length ? ` (${answer.attachments.length})` : ''}</button>
        <button type="button" onClick={jumpIncomplete} title="الانتقال لأقرب بند لم يُجَب"><SkipForward size={17}/> غير مكتمل</button>
        {index < questions.length - 1 ? <button type="button" className="ab-next" onClick={() => goNext()} data-testid="button-next-question" aria-label="التالي"><ArrowLeft size={18}/></button> : <button type="button" className="ab-next" onClick={() => setReview(true)} data-testid="button-review" aria-label="مراجعة وإنهاء"><FileCheck2 size={18}/></button>}
      </div>
    </div>, document.body)}
    {annot && answer.attachments.find(a => a.id === annot) && <PhotoAnnotator src={answer.attachments.find(a => a.id === annot)!.data} onCancel={() => setAnnot(null)} onSave={d => { update({ attachments: answer.attachments.map(a => a.id === annot ? { ...a, data: d, annotated: true } : a) }); setAnnot(null); }}/>}
    {toast && <div className="field-toast" role="status"><span>{toast.text}</span><button onClick={() => { setIndex(toast.back); setToast(null); }}>تراجع</button></div>}
  </div>;
}

function BranchStats({ branch, data }: { branch: Branch; data: ReturnType<typeof useLocalData> }) {
  const history = data.inspections.filter(i => i.branchId === branch.id && i.status === 'finalized').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const latestScore = history[0] ? calculateScore(history[0].questionSnapshot, history[0].answers) : undefined;
  const openFindings = data.actions.filter(a => a.branchName === branch.name && a.status !== 'مغلق').length;
  return <div className="branch-facts"><span>{history.length} زيارات</span><span>{openFindings} إجراءات مفتوحة</span><span>آخر نتيجة {latestScore?.score == null ? '—' : `${latestScore.score}%`}</span></div>;
}

function SettingsPage({ data }: { data: ReturnType<typeof useLocalData> }) {
  const stdCfg = useConfig();
  const stdProfile = useProfile();
  const canEditStandards = !cloudEnabled || isQualityLead(stdProfile);
  const [standards, setStandards] = useState<Question[]>(QUESTIONS);
  useEffect(() => { if (!standardsDirty) setStandards(applyStandards(QUESTIONS, stdCfg)); }, [stdCfg]);
  const [standardsDirty, setStandardsDirty] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchErr, setBranchErr] = useState('');
  const [city, setCity] = useState('');
  const [manager, setManager] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editManager, setEditManager] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const updateStandard = (id: number, patch: Partial<Question>) => { setStandards(old => old.map(q => q.id === id ? { ...q, ...patch } : q)); setStandardsDirty(true); };
  const saveStandards = async () => { if (!canEditStandards) { setSavedNote('تعديل المعايير لمدير الجودة فقط.'); return; } const v = await publishStandards(standards, QUESTIONS); setStandardsDirty(false); setSavedNote(v ? `نُشر الإصدار ${v} من المعايير لجميع المستخدمين. الزيارات السابقة تحتفظ بإصدارها.` : 'لا توجد تغييرات.'); };
  const saveBranch = async (e: React.FormEvent) => { e.preventDefault(); if (!branchName.trim()) return; const dup = data.branches.find(x => nameKey(x.name) === nameKey(branchName)); if (dup) { setBranchErr(`يوجد فرع بنفس الاسم مسبقاً: «${dup.name}»${dup.archived ? ' (مؤرشف — يمكنك إعادة تفعيله بدل إنشاء فرع جديد)' : ''}.`); return; } setBranchErr(''); const b: Branch = { id: newId(), name: branchName.trim(), city: city.trim(), manager: manager.trim(), archived: false, demo: false }; await put('branches', b); setBranchName(''); setCity(''); setManager(''); await data.refresh(); };
  const beginEdit = (b: Branch) => { setEditing(b.id); setEditName(b.name); setEditCity(b.city); setEditManager(b.manager || ''); };
  const commitEdit = async (b: Branch) => { await put('branches', { ...b, name: editName.trim() || b.name, city: editCity.trim(), manager: editManager.trim() }); setEditing(null); data.refresh(); };
  const toggleArchive = async (b: Branch) => { await put('branches', { ...b, archived: !b.archived }); data.refresh(); };
  const exportBackup = async () => {
    const payload = { product: 'Ratio Quality local backup', formatVersion: 1, exportedAt: stamp(), branches: data.branches, inspections: data.inspections, actions: data.actions, questions: await loadQuestions() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `ratio-quality-backup-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(url); setSavedNote('تم تنزيل نسخة JSON إلى جهازك. احتفظ بها في مكان آمن.');
  };
  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const validRecords = (items: unknown) => Array.isArray(items) && items.every(item => item && typeof item === 'object' && typeof item.id === 'string');
      if (parsed.product !== 'Ratio Quality local backup' || !validRecords(parsed.inspections) || !validRecords(parsed.branches) || !validRecords(parsed.actions)) throw new Error();
      if (!window.confirm('سيتم إضافة السجلات الجديدة فقط. السجلات الموجودة بالمعرّف نفسه ستبقى كما هي، ولن تُستبدل النتائج المكتملة. هل تريد المتابعة؟')) return;
      const [existingBranches, existingInspections, existingActions] = await Promise.all([
        list<Branch>('branches'), list<Inspection>('inspections'), list<ActionItem>('actions'),
      ]);
      const branchIds = new Set(existingBranches.map(item => item.id));
      const inspectionIds = new Set(existingInspections.map(item => item.id));
      const actionIds = new Set(existingActions.map(item => item.id));
      let imported = 0;
      let skipped = 0;
      for (const b of parsed.branches as Branch[]) {
        if (branchIds.has(b.id)) { skipped++; continue; }
        await put('branches', b); imported++;
      }
      for (const i of parsed.inspections as Inspection[]) {
        if (inspectionIds.has(i.id)) { skipped++; continue; }
        await put('inspections', i); imported++;
      }
      for (const a of parsed.actions as ActionItem[]) {
        if (actionIds.has(a.id)) { skipped++; continue; }
        await put('actions', a); imported++;
      }
      if (Array.isArray(parsed.questions) && parsed.questions.every((q: unknown) => q && typeof q === 'object' && 'id' in q && 'title' in q)) {
        const currentQuestions = await loadQuestions();
        if (JSON.stringify(currentQuestions) === JSON.stringify(QUESTIONS)) {
          await saveQuestions(parsed.questions as Question[]);
        }
      }
      await data.refresh();
      setSavedNote(`تم استيراد ${imported} سجلاً جديداً. تم تجاهل ${skipped} سجلاً موجوداً دون استبداله، وبقيت المعايير المحلية كما هي.`);
    } catch { setSavedNote('تعذر استيراد الملف. اختر نسخة JSON صادرة من هذا التطبيق.'); }
  };
  return <div className="page-content"><PageTitle eyebrow="التخصيص والبيانات" title="الإعدادات" detail="إدارة الفروع والمعايير ونسخ بيانات هذا الجهاز."/>
    <div className="settings-layout"><div className="settings-main"><Card className="settings-card"><div className="card-heading"><div><span className="eyebrow">دليل الفروع</span><h2>الفروع</h2></div><span className="count-badge">{data.branches.filter(b => !b.archived).length} نشط</span></div><div className="demo-warning"><Info size={16}/><span>قائمة الفروع من الملف المعتمد «الافرع القائمة». الفروع المغلقة محفوظة للتقارير التاريخية ولا تظهر عند بدء زيارة.</span></div><form className="add-branch-form" onSubmit={saveBranch}><input value={branchName} onChange={e => setBranchName(e.target.value)} placeholder="اسم الفرع الجديد" aria-label="اسم الفرع" data-testid="input-branch-name"/><input value={city} onChange={e => setCity(e.target.value)} placeholder="المدينة" aria-label="المدينة" data-testid="input-branch-city"/><input value={manager} onChange={e => setManager(e.target.value)} placeholder="مدير الفرع (اختياري)" aria-label="مدير الفرع" data-testid="input-branch-manager"/><Button type="submit" disabled={!branchName.trim()} data-testid="button-add-branch"><Plus size={16}/> إضافة</Button></form>{branchErr && <div className="form-error" role="alert">{branchErr}</div>}
      <div className="branch-list">{data.branches.map(b => <div className={`branch-row ${b.archived ? 'archived' : ''}`} key={b.id}>{editing === b.id ? <><input value={editName} onChange={e => setEditName(e.target.value)} aria-label="تعديل اسم الفرع"/><input value={editCity} onChange={e => setEditCity(e.target.value)} aria-label="تعديل المدينة"/><input value={editManager} onChange={e => setEditManager(e.target.value)} aria-label="تعديل مدير الفرع"/><button className="icon-button" onClick={() => commitEdit(b)} aria-label="حفظ التعديل"><Check size={17}/></button><button className="icon-button" onClick={() => setEditing(null)} aria-label="إلغاء"><X size={17}/></button></> : <><span className="branch-symbol"><Store size={18}/></span><div className="branch-name"><b>{b.name}</b><small>{b.city || 'مدينة غير محددة'}{b.manager && ` · المدير: ${b.manager}`} {b.demo && <i>مثال</i>}</small><BranchStats branch={b} data={data}/></div>{b.archived && <StatusPill>مؤرشف</StatusPill>}<button className="icon-button" onClick={() => beginEdit(b)} aria-label={`تعديل ${b.name}`} data-testid={`edit-branch-${b.id}`}><Pencil size={16}/></button><button className="icon-button" onClick={() => toggleArchive(b)} aria-label={b.archived ? 'إلغاء الأرشفة' : 'أرشفة الفرع'} data-testid={`archive-branch-${b.id}`}><Archive size={16}/></button></>}</div>)}</div>
    </Card><Card className="settings-card"><div className="card-heading"><div><span className="eyebrow">الأسئلة والأوزان</span><h2>معايير الفحص</h2></div><SlidersHorizontal size={19}/></div><div className="standards-note"><Info size={18}/><div><b>قائمة الفحص الرسمية (46 بنداً)</b><p>البنود والخطورة والأوزان مأخوذة من نموذج «قائمة فحص زيارة قسم الجودة». يمكن هنا ضبط نطاقات القياس حسب الوصفات المعتمدة؛ الخطورة لا تُعدَّل لأنها جزء من النموذج المعتمد.</p></div></div><div className="weights-row">{[['حرج','10','red'],['رئيسي','5','amber'],['بسيط','1','green']].map(([n,v,c]) => <div key={n} className={`weight-box ${c}`}><small>{n}</small><b>{v}</b><span>وزن</span></div>)}</div><p className="small-muted">النتيجة = وزن البنود المطابقة ÷ أوزان البنود المنطبقة. تُستبعد «لا ينطبق» من الحساب. أي إخفاق حرج يغيّر التصنيف إلى «غير مقبول» دون تغيير النتيجة الرقمية.</p>{(stdCfg.standardsHistory?.length ?? 0) > 0 && <details className="std-history"><summary>سجل إصدارات المعايير · الإصدار الحالي {stdCfg.standards?.version ?? 0}</summary>{stdCfg.standardsHistory!.map(h => <div key={h.version}><b>الإصدار {h.version}</b><small>{h.at.slice(0, 16).replace('T', ' ')} · {h.by}</small><ul>{h.changes.map((c, k) => <li key={k}>{c}</li>)}</ul></div>)}</details>}<div className="standards-editor-head"><b>تعريفات الأسئلة · {standards.length}</b><Button variant="outline" disabled={!standardsDirty} onClick={saveStandards} data-testid="button-save-standards">{standardsDirty ? 'حفظ التعديلات' : 'تم الحفظ'} <Check size={14}/></Button></div><div className="standards-editor">{standards.map(q => <details key={q.id} className="standard-item"><summary><span>{String(q.id).padStart(2,'0')}</span><b>{q.title}</b><small>{q.section}</small><ChevronLeft size={14}/></summary><div className="standard-fields"><label className="field wide"><span>معيار القبول / الوصف (أولي)</span><textarea value={q.criterion} onChange={e => updateStandard(q.id,{criterion:e.target.value})}/></label><div className="standard-edit-row"><label className="field"><span>نوع الإدخال</span><select value={q.inputType || 'status'} onChange={e => updateStandard(q.id,{inputType:e.target.value as Question['inputType']})}><option value="status">حالة مطابقة</option><option value="numeric">رقم</option><option value="text">نص</option><option value="single-choice">اختيار واحد</option><option value="multi-choice">اختيار متعدد</option><option value="rating">تقييم ١–٥</option><option value="date">تاريخ</option><option value="photo">صورة</option></select></label><label className="field"><span>الأهمية</span><select value={q.severity} disabled title="الخطورة من النموذج المعتمد"><option value="Critical">حرج · 10</option><option value="Major">رئيسي · 5</option><option value="Minor">بسيط · 1</option></select></label>{q.measurement && <><label className="field"><span>الحد الأدنى · {q.measurement.unit}</span><input type="number" value={q.measurement.min} onChange={e => updateStandard(q.id,{measurement:{...q.measurement!,min:Number(e.target.value)}})}/></label><label className="field"><span>الحد الأعلى · {q.measurement.unit}</span><input type="number" value={q.measurement.max} onChange={e => updateStandard(q.id,{measurement:{...q.measurement!,max:Number(e.target.value)}})}/></label></>}</div>{['single-choice','multi-choice'].includes(q.inputType || '') && <label className="field standard-options"><span>خيارات الإجابة · افصل بينها بفاصلة عربية أو إنجليزية</span><input value={(q.options || []).join('، ')} onChange={e => updateStandard(q.id,{options:e.target.value.split(/[،,]/).map(x => x.trim()).filter(Boolean)})}/></label>}</div></details>)}</div></Card></div>
    <div className="settings-aside"><Card className="settings-card"><div className="card-heading"><div><span className="eyebrow">التخزين</span><h2>بيانات هذا الجهاز</h2></div><ShieldCheck size={20}/></div><div className="local-callout"><span className="local-status-icon"><ShieldCheck size={20}/></span><div><b>{cloudEnabled ? 'متزامنة وآمنة' : 'محفوظة محلياً فقط'}</b><p>{cloudEnabled ? 'تُحفظ البيانات على الجهاز أولاً ثم تُزامن مع حسابك عند توفر الإنترنت، وتؤخذ منها نسخة احتياطية مشفرة.' : 'لا تُرسل بياناتك إلى خادم ولا تتم مزامنتها مع أجهزة أخرى.'}</p></div></div><Button variant="outline" className="full-button" onClick={exportBackup} data-testid="button-export-backup"><ArrowDownToLine size={17}/> تصدير نسخة JSON</Button><label className="button button-outline full-button import-button"><Upload size={17}/> استيراد نسخة JSON<input type="file" accept="application/json,.json" onChange={e => { importBackup(e.target.files?.[0]); e.currentTarget.value = ''; }} data-testid="input-import-backup"/></label>{savedNote && <p className="backup-note" data-testid="backup-status">{savedNote}</p>}<div className="backup-count">{data.inspections.length} زيارة · {data.actions.length} إجراء · {data.branches.length} فرع</div></Card>
      <Card className="settings-card"><div className="card-heading"><div><span className="eyebrow">التثبيت</span><h2>إضافة للشاشة الرئيسية</h2></div><Activity size={19}/></div><ol className="install-steps"><li><span>١</span>افتح هذه الصفحة في Safari على iPhone.</li><li><span>٢</span>اضغط زر المشاركة في أسفل الشاشة.</li><li><span>٣</span>اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة».</li></ol><div className="video-unsupported">الفيديو (حتى 30 ميجا) يُحفظ على هذا الجهاز ولا يُرفع للسحابة.</div></Card></div></div>
    <LegacyImportCard onDone={data.refresh}/>
    {cloudEnabled && <CloudUsageCard inspections={data.inspections}/>}
    <AccountCard/>
    <DiagnosticsCard/>
    <div className="settings-footnote"><Info size={15}/> المعايير والحدود المعروضة ليست معايير رسمية معتمدة؛ راجع واعتمد القيم داخلياً قبل التطبيق.</div>
  </div>;
}

function Router() {
  const data = useLocalData();
  return <RoutedErrorBoundary><AppShell><SearchPalette data={data} pages={[...nav, ...moreNav]}/><ApprovalAlert inspections={data.inspections}/><Suspense fallback={<div className="page-content route-loading" aria-busy="true"><span className="rl-bar"/><div className="skeleton-list"><i/><i/><i/></div></div>}><Switch>
    <Route path="/"><HomePage data={data}/></Route>
    <Route path="/visits"><VisitsPage data={data}/></Route>
    <Route path="/actions"><ActionsBoard data={data}/></Route>
    <Route path="/executive"><ExecutivePage data={data}/></Route>
    <Route path="/priorities"><PrioritiesPage data={data}/></Route>
    <Route path="/branches"><BranchesPage data={data}/></Route>
    <Route path="/branches/:id"><BranchProfile data={data}/></Route>
    <Route path="/analytics"><AnalyticsPage data={data}/></Route>
    <Route path="/equipment"><EquipmentPage data={data}/></Route>
    <Route path="/baristas"><BaristasPage data={data}/></Route>
    <Route path="/users"><UsersPage/></Route>
    <Route path="/config"><ConfigPage data={data}/></Route>
    <Route path="/inspection/:id/baristas"><BaristaEvaluation data={data}/></Route>
    <Route path="/reports"><ReportsPage data={data}/></Route>
    <Route path="/reports/:id"><ReportDetail data={data}/></Route>
    <Route path="/settings"><SettingsPage data={data}/></Route>
    <Route path="/inspection/new"><StartInspection data={data}/></Route>
    <Route path="/inspection/:id"><InspectionRunner data={data}/></Route>
    <Route component={NotFound}/>
  </Switch></Suspense></AppShell></RoutedErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><AuthGate><Router/></AuthGate></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
