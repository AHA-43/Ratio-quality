import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { Activity, Archive, ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronLeft, CircleHelp, ClipboardCheck, Clock3, Coffee, FileCheck2, FileText, Gauge, ImagePlus, Info, LayoutDashboard, ListChecks, MoreHorizontal, Pencil, Plus, Printer, Search, Settings, ShieldCheck, SlidersHorizontal, Store, Upload, X } from 'lucide-react';
import { AuthGate } from './AuthGate';
import { type ActionItem, type Answer, type Branch, type Inspection, type Question, QUESTIONS, emptyAnswer, initializeBranches, list, loadQuestions, newId, put, saveQuestions } from './data';
import { calculateScore, WEIGHTS } from './scoring';

const queryClient = new QueryClient();
const nav = [
  { href: '/', label: 'الرئيسية', icon: LayoutDashboard },
  { href: '/visits', label: 'الزيارات', icon: ClipboardCheck },
  { href: '/actions', label: 'الإجراءات', icon: ListChecks },
  { href: '/reports', label: 'التقارير', icon: FileText },
  { href: '/settings', label: 'الإعدادات', icon: Settings },
];
const types = ['زيارة جودة شاملة', 'فحص جودة القهوة', 'فحص المعدات', 'زيارة متابعة'];
const defaultAnswer = (a?: Answer): Answer => a || emptyAnswer();
const stamp = () => new Date().toISOString();
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

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);
  return <div dir="rtl" className="app-shell">
    <aside className="side-rail">
      <Link href="/" className="brand-lockup"><span className="brand-mark"><Coffee size={22}/></span><span><b>Ratio Quality</b><small>ريشيو للجودة</small></span></Link>
      <div className="rail-label">مساحة العمل</div>
      {nav.map(item => <Link key={item.href} href={item.href} data-testid={`nav-${item.href === '/' ? 'home' : item.href.slice(1)}`} className={`rail-link ${location === item.href ? 'active' : ''}`}><item.icon size={18}/><span>{item.label}</span></Link>)}
      <div className="rail-bottom"><div className="device-note"><ShieldCheck size={18}/><span>بياناتك محفوظة على هذا الجهاز فقط</span></div><span className="rail-version">الإصدار المحلي · 1.0</span></div>
    </aside>
    <div className="main-column">
      <header className="topbar">
        <button className="icon-button menu-toggle" onClick={() => setMobileMenu(!mobileMenu)} aria-label="فتح القائمة" data-testid="button-menu"><MoreHorizontal size={22}/></button>
        <div className="crumb">{nav.find(n => n.href === location)?.label || (location.startsWith('/inspection') ? 'الزيارة الميدانية' : location.startsWith('/reports') ? 'التقرير' : 'مساحة العمل')}</div>
        <div className="topbar-right"><span className="local-chip"><span/> محلي على هذا الجهاز</span><span className="avatar">ج</span></div>
      </header>
      {mobileMenu && <div className="mobile-menu">{nav.map(n => <Link key={n.href} href={n.href} onClick={() => setMobileMenu(false)} data-testid={`mobile-nav-${n.href}`}>{n.label}</Link>)}</div>}
      <main className="page-wrap">{children}</main>
      <nav className="bottom-nav" aria-label="التنقل الرئيسي">{nav.map(n => <Link href={n.href} key={n.href} data-testid={`bottom-nav-${n.href === '/' ? 'home' : n.href.slice(1)}`} className={location === n.href ? 'selected' : ''}><n.icon size={20}/><span>{n.label}</span></Link>)}</nav>
    </div>
  </div>;
}

function PageTitle({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="page-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{detail && <p>{detail}</p>}</div>{action}</div>;
}
function Button({ children, variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'outline' | 'danger' }) {
  return <button className={`button button-${variant} ${props.className || ''}`} {...props}>{children}</button>;
}
function EmptyState({ icon: Icon = ClipboardCheck, title, text, action }: { icon?: typeof ClipboardCheck; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={24}/></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}
function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) { return <span className={`status-pill tone-${tone}`}>{children}</span>; }
function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`surface-card ${className}`}>{children}</section>; }

function useLocalData() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const refresh = async () => {
    try {
      const [i, b, a] = await Promise.all([list<Inspection>('inspections'), list<Branch>('branches'), list<ActionItem>('actions')]);
      setInspections(i.sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)));
      setBranches(b.sort((x, y) => x.name.localeCompare(y.name, 'ar')));
      setActions(a.sort((x, y) => x.dueDate.localeCompare(y.dueDate)));
      setError('');
    } catch (e) {
      setError('تعذر الوصول إلى التخزين المحلي. تحقق من إعدادات المتصفح ثم أعد المحاولة.');
    } finally { setReady(true); }
  };
  useEffect(() => { initializeBranches().then(refresh).catch(() => { setError('تعذر تهيئة التخزين المحلي.'); setReady(true); }); }, []);
  return { inspections, branches, actions, ready, error, refresh };
}

function HomePage({ data }: { data: ReturnType<typeof useLocalData> }) {
  const drafts = data.inspections.filter(i => i.status === 'draft');
  const finished = data.inspections.filter(i => i.status === 'finalized');
  const openActions = data.actions.filter(a => a.status !== 'مغلق');
  const scores = finished.map(i => calculateScore(i.questionSnapshot, i.answers).score).filter((x): x is number => x !== null);
  const average = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';
  return <div className="page-content">
    <PageTitle eyebrow="لوحة الجودة · اليوم" title="صباح الجودة" detail="متابعة الزيارات والإجراءات من نقطة العمل." action={<Link href="/inspection/new" className="button button-primary" data-testid="button-start-inspection"><Plus size={18}/> بدء زيارة</Link>}/>
    {data.error && <div className="alert alert-danger">{data.error}<Button variant="outline" onClick={data.refresh}>إعادة المحاولة</Button></div>}
    <div className="hero-strip"><div><div className="hero-label">مساحة العمل المحلية</div><h2>جودة القهوة تبدأ<br/>من التفاصيل الصغيرة.</h2><p>سجّل الملاحظة، وثّقها، وتابعها حتى الإغلاق.</p><Link href="/inspection/new" className="text-link">ابدأ جولة جديدة <ArrowLeft size={16}/></Link></div><div className="hero-illustration"><span className="orbit orbit-one"/><span className="orbit orbit-two"/><span className="hero-cup"><Coffee size={50}/></span><span className="hero-spark">R</span></div></div>
    <div className="metric-grid">
      <Card className="metric-card"><span className="metric-icon"><ClipboardCheck size={18}/></span><small>زيارات مكتملة</small><strong data-testid="metric-completed">{finished.length}</strong><span className="metric-caption">محفوظة على هذا الجهاز</span></Card>
      <Card className="metric-card"><span className="metric-icon green"><Gauge size={18}/></span><small>متوسط الالتزام</small><strong>{average}{average !== '—' && <em>%</em>}</strong><span className="metric-caption">من الزيارات المكتملة</span></Card>
      <Card className="metric-card"><span className="metric-icon amber"><Clock3 size={18}/></span><small>مسودات الزيارات</small><strong>{drafts.length}</strong><span className="metric-caption">جاهزة للاستكمال</span></Card>
      <Card className="metric-card"><span className="metric-icon red"><ListChecks size={18}/></span><small>إجراءات مفتوحة</small><strong>{openActions.length}</strong><span className="metric-caption">تحتاج إلى متابعة</span></Card>
    </div>
    <div className="dashboard-grid">
      <Card className="dashboard-main"><div className="card-heading"><div><span className="eyebrow">تابع من حيث توقفت</span><h2>الزيارات الأخيرة</h2></div><Link href="/visits" className="text-link">كل الزيارات <ArrowLeft size={15}/></Link></div>
        {!data.ready ? <div className="skeleton-list"><i/><i/><i/></div> : data.inspections.length ? <div className="visit-list">{data.inspections.slice(0, 4).map(i => <InspectionRow key={i.id} inspection={i}/>)}</div> : <EmptyState title="ابدأ أول زيارة ميدانية" text="لن تظهر بيانات أو نتائج حتى تسجل زيارة فعلية." action={<Link href="/inspection/new" className="button button-soft"><Plus size={16}/> بدء زيارة</Link>}/>}
      </Card>
      <Card className="dashboard-side"><div className="card-heading"><div><span className="eyebrow">تحتاج انتباهك</span><h2>الإجراءات المفتوحة</h2></div><Link href="/actions" className="small-arrow"><ChevronLeft size={18}/></Link></div>
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
function InspectionRow({ inspection }: { inspection: Inspection }) {
  const score = calculateScore(inspection.questionSnapshot, inspection.answers);
  const href = inspection.status === 'finalized' ? `/reports/${inspection.id}` : `/inspection/${inspection.id}`;
  return <Link href={href} className="visit-row" data-testid={`visit-row-${inspection.id}`}><span className="branch-symbol"><Store size={18}/></span><span className="visit-info"><b>{inspection.branchName || 'فرع غير محدد'}</b><small>{inspection.type} · {inspection.date}</small></span><span className="visit-score">{score.score === null ? <StatusPill tone={inspection.status === 'draft' ? 'amber' : 'neutral'}>{inspection.status === 'draft' ? 'مسودة' : 'غير مكتمل'}</StatusPill> : <><b>{score.score}%</b><small>{score.classification}</small></>}</span><ChevronLeft className="visit-chevron" size={16}/></Link>;
}

function VisitsPage({ data }: { data: ReturnType<typeof useLocalData> }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('الكل');
  const [branchId, setBranchId] = useState('الكل');
  const [visitDate, setVisitDate] = useState('');
  const [classification, setClassification] = useState('الكل');
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
    <Card><div className="toolbar"><label className="search-field"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث بالفرع أو المفتش…" data-testid="input-visit-search"/></label><div className="segmented">{['الكل','مسودات','مكتملة'].map(x => <button key={x} className={filter === x ? 'on' : ''} onClick={() => setFilter(x)} data-testid={`filter-${x}`}>{x}</button>)}</div></div>
      <div className="history-filters">
        <label className="field"><span>الفرع</span><select value={branchId} onChange={e => setBranchId(e.target.value)} data-testid="filter-branch"><option value="الكل">كل الفروع</option>{data.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="field"><span>التاريخ</span><input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} data-testid="filter-date"/></label>
        <label className="field"><span>التصنيف</span><select value={classification} onChange={e => setClassification(e.target.value)} data-testid="filter-classification"><option>الكل</option><option>ممتاز</option><option>جيد</option><option>يحتاج تحسين</option><option>غير مقبول</option></select></label>
      </div>
      {!data.ready ? <div className="skeleton-list"><i/><i/><i/></div> : filtered.length ? <div className="visit-list">{filtered.map(i => <InspectionRow key={i.id} inspection={i}/>)}</div> : <EmptyState title={query ? 'لا توجد نتائج مطابقة' : 'لا توجد زيارات بعد'} text={query ? 'جرّب البحث بكلمة أخرى أو غيّر عامل التصفية.' : 'أنشئ زيارة ميدانية لحفظ الملاحظات والنتائج محلياً.'} action={!query && <Link href="/inspection/new" className="button button-soft"><Plus size={16}/> بدء زيارة</Link>}/>}
    </Card></div>;
}

function ActionsPage({ data }: { data: ReturnType<typeof useLocalData> }) {
  const [filter, setFilter] = useState('الكل');
  const statuses: ActionItem['status'][] = ['مفتوح', 'قيد المعالجة', 'بانتظار التحقق', 'مغلق'];
  const rows = data.actions.filter(a => filter === 'الكل' || a.status === filter);
  const advance = async (a: ActionItem) => { if (a.status === 'مغلق') return; const next = statuses[statuses.indexOf(a.status) + 1]; await put('actions', { ...a, status: next }); data.refresh(); };
  return <div className="page-content"><PageTitle eyebrow="تحسين مستمر" title="الإجراءات التصحيحية" detail="تابع الملاحظات من الإسناد إلى التحقق والإغلاق."/><div className="filter-scroll">{['الكل', ...statuses].map(s => <button key={s} onClick={() => setFilter(s)} className={`filter-chip ${filter === s ? 'active' : ''}`} data-testid={`action-filter-${s}`}>{s}{s === 'الكل' && <span>{data.actions.length}</span>}</button>)}</div>
    {rows.length ? <div className="action-cards">{rows.map(a => <Card key={a.id} className="action-card"><div className="action-head"><span className={`severity-tag ${a.severity.toLowerCase()}`}>{a.severity === 'Critical' ? 'حرج' : a.severity === 'Major' ? 'رئيسي' : 'بسيط'}</span><span className="action-date">استحقاق {a.dueDate || 'غير محدد'}</span></div><h3>{a.title}</h3><p className="action-description">{a.description}</p><p>{a.recommendation || 'لا توجد توصية مسجلة.'}</p>{Boolean(a.evidence?.length) && <div className="action-evidence">{a.evidence?.map(image => <img key={image.id} src={image.data} alt={image.caption || 'دليل الإجراء'}/>)}</div>}<div className="action-meta"><span><Store size={14}/>{a.branchName}</span><span><UserIcon/> {a.responsible || 'دون مسؤول'}</span><span>السؤال #{a.questionId}</span></div><div className="action-footer"><StatusPill tone={a.status === 'مغلق' ? 'green' : a.status === 'بانتظار التحقق' ? 'amber' : 'red'}>{a.status}</StatusPill><button className="button button-outline button-small" onClick={() => advance(a)} data-testid={`advance-action-${a.id}`}>{a.status === 'مغلق' ? 'إعادة فتح' : 'تحديث الحالة'} <ChevronLeft size={15}/></button></div></Card>)}</div> : <Card><EmptyState icon={ListChecks} title="قائمة الإجراءات فارغة" text="عند تسجيل ملاحظة غير مطابقة، أنشئ إجراءً تصحيحياً مرتبطاً بها." /></Card>}</div>;
}
function UserIcon() { return <span className="mini-user">م</span>; }

function ReportsPage({ data }: { data: ReturnType<typeof useLocalData> }) {
  const reports = data.inspections.filter(i => i.status === 'finalized');
  return <div className="page-content"><PageTitle eyebrow="نتائج قابلة للطباعة" title="التقارير" detail="كل تقرير يعرض لقطة محفوظة من الأسئلة والمعايير وقت الإنهاء."/>
    {reports.length ? <Card><div className="report-list">{reports.map(i => { const result = calculateScore(i.questionSnapshot, i.answers); return <div className="report-row" key={i.id}><span className="report-icon"><FileCheck2 size={19}/></span><div className="report-info"><b>{i.branchName}</b><small>{i.date} · {i.inspector} · {i.type}</small></div><div className="report-result"><b>{result.score}%</b><small>{result.classification}</small></div><Link href={`/reports/${i.id}`} className="button button-outline button-small" data-testid={`open-report-${i.id}`}>فتح التقرير <ArrowLeft size={14}/></Link></div>; })}</div></Card> : <Card><EmptyState icon={FileText} title="لا توجد تقارير مكتملة" text="بعد إنهاء الزيارة ستجد التقرير هنا، جاهزاً للطباعة من المتصفح." action={<Link href="/inspection/new" className="button button-soft"><Plus size={16}/> بدء زيارة</Link>}/></Card>}</div>;
}

function ReportDetail({ data }: { data: ReturnType<typeof useLocalData> }) {
  const [match, params] = useRoute('/reports/:id');
  const inspection = match ? data.inspections.find(i => i.id === params?.id) : undefined;
  if (!inspection) return <div className="page-content"><Link href="/reports" className="text-link"><ArrowRight size={15}/> عودة للتقارير</Link><EmptyState title="التقرير غير موجود" text="قد تكون البيانات قد حذفت من هذا الجهاز."/></div>;
  const score = calculateScore(inspection.questionSnapshot, inspection.answers);
  const findings = inspection.questionSnapshot.filter(q => inspection.answers[q.id]?.value === 'fail' || inspection.answers[q.id]?.initialValue === 'fail');
  const sections = [...new Set(inspection.questionSnapshot.map(q => q.section))];
  return <div className="page-content report-page"><div className="report-actions no-print"><Link href="/reports" className="button button-outline"><ArrowRight size={16}/> عودة</Link><Button onClick={() => window.print()}><Printer size={17}/> طباعة التقرير</Button></div><article className="print-report">
    <header className="print-cover"><div className="report-brand"><span className="brand-mark"><Coffee size={19}/></span><span><b>Ratio Quality</b><small>ريشيو للجودة</small></span></div><span className="report-label">تقرير زيارة جودة</span><h1>{inspection.branchName}</h1><p>{inspection.type} · {inspection.date}</p><div className="report-meta-grid"><span>المفتش <b>{inspection.inspector}</b></span><span>الفترة <b>{inspection.shift}</b></span><span>عدد الموظفين <b>{inspection.employees}</b></span><span>رقم الزيارة <b>{inspection.id.slice(-8).toUpperCase()}</b></span></div></header>
    <div className="report-score"><div><small>النتيجة الإجمالية</small><strong>{score.score}%</strong><span>{score.classification} · {score.criticalFailures ? 'تجاوز حرج يغيّر التصنيف' : 'النتيجة حسب الأوزان'}</span></div><div className="report-score-note"><b>ملخص النتائج</b><p>{inspection.questionSnapshot.length - findings.length} مطابق · {findings.length} ملاحظة · {inspection.questionSnapshot.length} سؤالاً</p><p>حرج {findings.filter(q => inspection.answers[q.id]?.severity === 'Critical').length} · رئيسي {findings.filter(q => inspection.answers[q.id]?.severity === 'Major').length} · بسيط {findings.filter(q => inspection.answers[q.id]?.severity === 'Minor').length} · متكرر {findings.filter(q => inspection.answers[q.id]?.recurring).length}</p><p>الأوزان: حرج {WEIGHTS.Critical} · رئيسي {WEIGHTS.Major} · بسيط {WEIGHTS.Minor}</p></div></div>
    <h2 className="report-section-title">النتائج حسب القسم</h2>
    {sections.map(section => <section className="report-section" key={section}><h3>{section}</h3>{inspection.questionSnapshot.filter(q => q.section === section).map(q => { const a = inspection.answers[q.id]; const wasFailed = a.value === 'fail' || a.initialValue === 'fail'; return <div className="report-finding" key={q.id}><span className={`finding-mark ${wasFailed ? 'failed' : a.value === 'na' ? 'na' : 'passed'}`}>{wasFailed ? '!' : a.value === 'na' ? '—' : '✓'}</span><div><b>{q.id}. {q.title}</b><small>{q.criterion}</small>{wasFailed && <p>{a.observation || 'لم تسجل ملاحظة تفصيلية.'}{a.value !== 'fail' ? (a.correctedDuringVisit ? ` — تم التصحيح خلال الزيارة: ${a.correctionNote || 'تم تسجيل التصحيح.'}` : ' — تم تعديل الحالة، دون تأكيد تسجيل التصحيح. الإخفاق الأولي محفوظ.') : ''}{a.recommendation && ` — التوصية: ${a.recommendation}`}</p>}{a.attachments.map(img => <figure className="report-evidence" key={img.id}><img src={img.data} alt={img.caption || 'دليل مرفق'}/>{img.caption && <figcaption>{img.caption}</figcaption>}</figure>)}</div><StatusPill tone={a.value === 'fail' ? 'red' : a.value === 'na' ? 'neutral' : 'green'}>{a.value === 'fail' ? 'غير مطابق' : a.value === 'na' ? 'لا ينطبق' : 'مطابق حالياً'}</StatusPill></div>; })}</section>)}
    <h2 className="report-section-title">خطة الإجراءات</h2>{data.actions.filter(a => a.inspectionId === inspection.id).length ? data.actions.filter(a => a.inspectionId === inspection.id).map(a => <div className="report-action" key={a.id}><div><b>{a.title}</b><small>{a.description}</small></div><span>{a.responsible || 'دون مسؤول'} · {a.dueDate || 'دون موعد'} · {a.status}</span></div>) : <p className="muted-text">لا توجد إجراءات مرتبطة بهذه الزيارة.</p>}
    <div className="report-closing"><b>ملاحظة المنهجية</b><p>المعايير والعتبات الظاهرة في هذا التقرير أولية وقابلة للتعديل، وليست معايير رسمية معتمدة من Ratio. تم حفظ التقرير محلياً على الجهاز.</p></div>
    </article></div>;
}

function StartInspection({ data }: { data: ReturnType<typeof useLocalData> }) {
  const [, setLocation] = useLocation();
  const [questions, setQuestions] = useState<Question[]>(QUESTIONS);
  const form = useForm<InspectionStartValues>({
    resolver: zodResolver(inspectionStartSchema),
    defaultValues: { branchId: '', inspector: '', type: types[0], shift: 'صباحية', employees: 2, date: localDateTime() },
  });
  const branchId = form.watch('branchId');
  const type = form.watch('type');
  const [error, setError] = useState('');
  useEffect(() => { loadQuestions().then(setQuestions).catch(() => setQuestions(QUESTIONS)); }, []);
  const activeBranches = data.branches.filter(b => !b.archived);
  const start = async (values: InspectionStartValues) => {
    setError('');
    const branch = activeBranches.find(b => b.id === branchId)!;
    let selectedQuestions = questions;
    if (type === 'فحص جودة القهوة') {
      selectedQuestions = questions.filter(q => q.section === 'جودة القهوة' || q.section === 'تجربة المشروبات والتذوق');
    } else if (type === 'فحص المعدات') {
      selectedQuestions = questions.filter(q => q.section === 'المعدات والجاهزية');
    } else if (type === 'زيارة متابعة') {
      const followUpIds = new Set(data.inspections
        .filter(i => i.branchId === branchId && i.status === 'finalized')
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
    const insp: Inspection = { id, status: 'draft', branchId: values.branchId, branchName: branch.name, inspector: values.inspector.trim(), date: values.date.replace('T', ' '), type: values.type, shift: values.shift, employees: values.employees, answers: {}, questionSnapshot: selectedQuestions.map(q => ({ ...q, measurement: q.measurement ? { ...q.measurement } : undefined, options: q.options ? [...q.options] : undefined })), createdAt: stamp(), updatedAt: stamp() };
    await put('inspections', insp); await data.refresh(); setLocation(`/inspection/${id}`);
  };
  return <div className="page-content narrow-page"><Link href="/" className="back-link"><ArrowRight size={16}/> الرئيسية</Link><PageTitle eyebrow="زيارة جديدة" title="بيانات الجولة" detail="سجّل تفاصيل الزيارة قبل بدء الفحص. ستُحفظ المسودة تلقائياً على هذا الجهاز."/>
    <Form {...form}><form className="form-card" onSubmit={form.handleSubmit(start)}><div className="form-grid">
      <label className="field wide"><span>الفرع <em>*</em></span><select {...form.register('branchId')} data-testid="select-branch"><option value="">اختر الفرع</option>{activeBranches.map(b => <option key={b.id} value={b.id}>{b.name}{b.demo ? ' · فرع مثال' : ''}</option>)}</select>{form.formState.errors.branchId && <small className="form-error">{form.formState.errors.branchId.message}</small>}</label>
      <label className="field wide"><span>اسم المفتش <em>*</em></span><input {...form.register('inspector')} placeholder="الاسم الكامل" data-testid="input-inspector"/>{form.formState.errors.inspector && <small className="form-error">{form.formState.errors.inspector.message}</small>}</label>
      <label className="field wide"><span>نوع الزيارة</span><select {...form.register('type')} data-testid="select-inspection-type">{types.map(t => <option key={t}>{t}</option>)}</select></label>
      <label className="field"><span>تاريخ ووقت الزيارة</span><input type="datetime-local" {...form.register('date')} data-testid="input-inspection-date"/></label>
      <label className="field"><span>الفترة</span><select {...form.register('shift')} data-testid="select-shift"><option>صباحية</option><option>مسائية</option></select></label>
      <label className="field"><span>عدد الموظفين</span><input type="number" min="0" {...form.register('employees', { valueAsNumber: true })} data-testid="input-employees"/>{form.formState.errors.employees && <small className="form-error">{form.formState.errors.employees.message}</small>}</label>
    </div>{error && <div className="form-error">{error}</div>}<div className="form-note"><Info size={17}/><span>البيانات لا تغادر هذا الجهاز. لا يوجد نسخ احتياطي سحابي أو مزامنة بين الأجهزة.</span></div><Button type="submit" className="full-button" data-testid="button-create-inspection">حفظ وبدء الفحص <ArrowLeft size={17}/></Button></form></Form>
  </div>;
}

function InspectionRunner({ data }: { data: ReturnType<typeof useLocalData> }) {
  const [, params] = useRoute('/inspection/:id');
  const id = params?.id || '';
  const inspection = data.inspections.find(i => i.id === id);
  const [, setLocation] = useLocation();
  const [answers, setAnswers] = useState<Record<number, Answer>>(inspection?.answers || {});
  const [index, setIndex] = useState(0);
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState('');
  const [actionForm, setActionForm] = useState<number | null>(null);
  const [responsible, setResponsible] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saved, setSaved] = useState(true);
  const questions = inspection?.questionSnapshot || QUESTIONS;
  const q = questions[index];
  const answer = defaultAnswer(q ? answers[q.id] : undefined);
  const score = useMemo(() => calculateScore(questions, answers), [questions, answers]);
  useEffect(() => { if (inspection) setAnswers(inspection.answers); }, [inspection?.id]);
  useEffect(() => { if (inspection?.status === 'finalized') setLocation(`/reports/${inspection.id}`); }, [inspection?.id, inspection?.status, setLocation]);
  useEffect(() => {
    if (!inspection || inspection.status !== 'draft') return;
    setSaved(false);
    const timer = window.setTimeout(async () => {
      await put('inspections', { ...inspection, answers, updatedAt: stamp() });
      setSaved(true); data.refresh();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [answers, inspection?.id]);
  if (!inspection) return <div className="page-content"><EmptyState title="المسودة غير موجودة" text="قد تكون حذفت أو استوردت على جهاز آخر." action={<Link href="/visits" className="button button-soft">العودة للزيارات</Link>}/></div>;
  const update = (patch: Partial<Answer>, questionId = q.id) => setAnswers(old => {
    const previous = defaultAnswer(old[questionId]);
    const next = { ...previous, ...patch };
    if (patch.value === 'fail' && previous.initialValue !== 'fail') next.initialValue = 'fail';
    return { ...old, [questionId]: next };
  });
  const failMissing = questions.filter(item => answers[item.id]?.value === 'fail' && !answers[item.id]?.observation.trim());
  const canFinalize = score.score !== null && failMissing.length === 0;
  const finalize = async () => {
    if (score.unanswered.length) { setMessage(`أكمل الأسئلة المطلوبة أولاً. المتبقي ${score.unanswered.length}.`); setReview(false); setIndex(questions.findIndex(x => score.unanswered.includes(x.id))); return; }
    if (failMissing.length) { setMessage(`أضف وصف الملاحظة للسؤال رقم ${failMissing[0].id}.`); setReview(false); setIndex(questions.findIndex(x => x.id === failMissing[0].id)); return; }
    await put('inspections', { ...inspection, status: 'finalized', answers, finalizedAt: stamp(), updatedAt: stamp(), questionSnapshot: questions.map(x => ({ ...x })) });
    setMessage('تم إنهاء الزيارة وحفظ لقطة التقرير.'); await data.refresh(); setReview(true);
  };
  const addAction = async (question: Question) => {
    const a = answers[question.id];
    const item: ActionItem = { id: newId(), title: `${question.title} — ${inspection.branchName}`, description: a.observation, branchName: inspection.branchName, questionId: question.id, inspectionId: inspection.id, responsible, dueDate, status: 'مفتوح', severity: a.severity, recommendation: a.recommendation, evidence:a.attachments.map(item => ({...item})) };
    await put('actions', item); await data.refresh(); setActionForm(null); setMessage('تم إنشاء الإجراء التصحيحي وربطه بالزيارة.');
  };
  const selectPhoto = async (files: FileList | null) => {
    if (!files) return;
    const readData = (blob: Blob) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(); r.readAsDataURL(blob); });
    const toData = async (file: File) => {
      if (file.size < 1400000 || !('createImageBitmap' in window)) return readData(file);
      try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
        const context = canvas.getContext('2d'); if (!context) return readData(file);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
        const compressed = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .86));
        return readData(compressed || file);
      } catch { return readData(file); }
    };
    const images = await Promise.all([...files].filter(f => f.type.startsWith('image/')).map(async f => ({ id: newId(), name: f.name, type: 'image/jpeg', data: await toData(f), caption: '' })));
    if (images.length) update({ attachments: [...answer.attachments, ...images] });
  };
  const updateCaption = (attachmentId: string, caption: string) => update({ attachments: answer.attachments.map(img => img.id === attachmentId ? { ...img, caption } : img) });
  const removePhoto = (attachmentId: string) => update({ attachments: answer.attachments.filter(img => img.id !== attachmentId) });
  const sectionGroups = [...new Set(questions.map(x => x.section))];
  const answeredCount = questions.filter(x => answers[x.id]?.value !== null && answers[x.id]?.value !== undefined).length;
  const isFinal = inspection.status === 'finalized';
  return <div className="page-content runner-page">
    <div className="runner-top"><Link href="/visits" className="back-link"><ArrowRight size={16}/> الزيارات</Link><div className="save-state"><span className={saved || isFinal ? 'saved-dot' : 'saving-dot'}/>{isFinal ? 'زيارة مكتملة' : saved ? 'محفوظ تلقائياً' : 'جارٍ الحفظ…'}</div></div>
    <div className="runner-intro"><div><div className="eyebrow">{inspection.branchName} · {inspection.shift}</div><h1>{inspection.type}</h1><p>{inspection.inspector} <span>·</span> {inspection.date}</p></div><span className="question-counter">{answeredCount}<small> / {questions.length} مكتمل</small></span></div>
    <div className="progress-track"><span style={{ width: `${(answeredCount / questions.length) * 100}%` }}/></div>
    {message && <div className="alert alert-info"><Info size={16}/>{message}<button onClick={() => setMessage('')} aria-label="إغلاق"><X size={16}/></button></div>}
    {review ? <div className="review-layout"><Card className="review-summary"><span className="eyebrow">مراجعة قبل الإنهاء</span><h2>{isFinal ? 'تم إنهاء الزيارة' : 'ملخص الزيارة'}</h2><div className={`score-ring ${score.classification === 'غير مقبول' ? 'score-bad' : ''}`}><b>{score.score === null ? '—' : `${score.score}%`}</b><small>{score.classification || 'غير مكتمل'}</small></div><div className="score-key">{score.criticalFailures ? <span className="text-red">{score.criticalFailures} إخفاق حرج — التصنيف غير مقبول</span> : 'التصنيف يعتمد على النتيجة والأوزان'}</div><div className="summary-counts"><span><i className="dot-green"/> مطابق حالياً <b>{questions.filter(x => answers[x.id]?.value === 'pass').length}</b></span><span><i className="dot-red"/> غير مطابق حالياً <b>{questions.filter(x => answers[x.id]?.value === 'fail').length}</b></span><span><i className="dot-muted"/> لا ينطبق <b>{questions.filter(x => answers[x.id]?.value === 'na').length}</b></span></div><div className="severity-summary"><span>حرج محفوظ <b>{questions.filter(x => (answers[x.id]?.value === 'fail' || answers[x.id]?.initialValue === 'fail') && answers[x.id]?.severity === 'Critical').length}</b></span><span>رئيسي محفوظ <b>{questions.filter(x => (answers[x.id]?.value === 'fail' || answers[x.id]?.initialValue === 'fail') && answers[x.id]?.severity === 'Major').length}</b></span><span>بسيط محفوظ <b>{questions.filter(x => (answers[x.id]?.value === 'fail' || answers[x.id]?.initialValue === 'fail') && answers[x.id]?.severity === 'Minor').length}</b></span><span>متكرر <b>{questions.filter(x => (answers[x.id]?.value === 'fail' || answers[x.id]?.initialValue === 'fail') && answers[x.id]?.recurring).length}</b></span></div>{!isFinal && <Button className="full-button" disabled={!canFinalize} onClick={finalize} data-testid="button-finalize"><CheckCircle2 size={17}/> إنهاء الزيارة</Button>}{isFinal && <Link className="button button-primary full-button" href={`/reports/${id}`}>فتح التقرير <ArrowLeft size={16}/></Link>}<Button variant="outline" className="full-button" onClick={() => setReview(false)}>{isFinal ? 'العودة للملخص' : 'العودة للفحص'}</Button>{!canFinalize && !isFinal && <p className="validation-hint">يلزم الإجابة عن جميع الأسئلة وإضافة ملاحظة لكل إخفاق قبل الإنهاء.</p>}</Card>
       <div className="review-sections">{sectionGroups.map(section => <Card key={section} className="review-section-card"><div className="card-heading"><h3>{section}</h3><span>{questions.filter(x => x.section === section).filter(x => answers[x.id]?.value === 'fail' || answers[x.id]?.initialValue === 'fail').length} ملاحظة</span></div>{questions.filter(x => x.section === section).map(item => { const a = defaultAnswer(answers[item.id]); const failedInitially = a.value === 'fail' || a.initialValue === 'fail'; return <button className="review-question" key={item.id} disabled={isFinal} onClick={() => { setIndex(questions.findIndex(x => x.id === item.id)); setReview(false); }}><span className={`finding-mark ${failedInitially ? 'failed' : a.value === 'na' ? 'na' : a.value === 'pass' ? 'passed' : 'empty'}`}>{failedInitially ? '!' : a.value === 'pass' ? '✓' : a.value === 'na' ? '—' : '·'}</span><span>{item.id}. {item.title}</span><ChevronLeft size={15}/></button>; })}</Card>)}</div></div> :
    <div className="inspection-layout"><aside className="section-sidebar"><span className="eyebrow">أقسام الفحص</span>{sectionGroups.map((section, sIndex) => <button key={section} className={`section-jump ${q?.section === section ? 'current' : ''}`} onClick={() => setIndex(questions.findIndex(item => item.section === section))} data-testid={`jump-section-${sIndex}`}><span className="section-number">{String(sIndex + 1).padStart(2, '0')}</span><span>{section}</span><small>{questions.filter(x => x.section === section && answers[x.id]?.value != null).length}/{questions.filter(x => x.section === section).length}</small></button>)}<button className="review-link" onClick={() => setReview(true)}><FileCheck2 size={16}/> مراجعة الزيارة</button></aside>
    <div className="question-column"><div className="question-breadcrumb"><span>{q?.section}</span><span>السؤال {index + 1} من {questions.length}</span></div><Card className="question-card"><div className="question-number">{String(q.id).padStart(2, '0')}<span> / {questions.length}</span></div><h2>{q.title}</h2><p className="criteria">{q.criterion} <span>معيار أولي قابل للتعديل</span></p>
      {q.measurement && (() => { const hasRange = q.measurement.min !== undefined && q.measurement.max !== undefined; return <div className="measurement-box"><div><span>النطاق المعتمد <small>(قابل للتعديل)</small></span><b>{hasRange ? `${q.measurement.min} – ${q.measurement.max} ${q.measurement.unit}` : `لم يُحدَّد معيار · الوحدة ${q.measurement.unit}`}</b></div><div><span>القراءة الفعلية</span><label><input type="number" inputMode="decimal" value={answer.actual ?? ''} onChange={e => update({ actual: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="—" data-testid={`input-measure-${q.id}`}/><small>{q.measurement.unit}</small></label></div>{hasRange && answer.actual !== undefined && <div className={`measure-check ${answer.actual >= q.measurement.min! && answer.actual <= q.measurement.max! ? 'within' : 'outside'}`} data-testid={`measure-check-${q.id}`}>{answer.actual >= q.measurement.min! && answer.actual <= q.measurement.max! ? 'ضمن النطاق' : 'خارج النطاق'} · النطاق يحتاج اعتماداً داخلياً</div>}</div>; })()}
      {q.inputType && q.inputType !== 'status' && <div className="typed-response"><div className="answer-label">قراءة إضافية <small>اختياري</small></div>{q.inputType === 'numeric' && !q.measurement && <input className="typed-input" type="number" inputMode="decimal" value={answer.entry as string || ''} onChange={e => update({ entry:e.target.value })} placeholder="أدخل القراءة" data-testid={`input-numeric-${q.id}`}/>}
        {q.inputType === 'text' && <textarea className="typed-input typed-text" value={answer.entry as string || ''} onChange={e => update({ entry:e.target.value })} placeholder="اكتب التفاصيل…" data-testid={`input-text-${q.id}`}/>}
        {q.inputType === 'single-choice' && <select className="typed-input" value={answer.entry as string || ''} onChange={e => update({ entry:e.target.value })} data-testid={`input-choice-${q.id}`}><option value="">اختر إجابة</option>{(q.options?.length ? q.options : ['خيار ١','خيار ٢','خيار ٣']).map(o => <option key={o}>{o}</option>)}</select>}
        {q.inputType === 'multi-choice' && <div className="multi-options">{(q.options?.length ? q.options : ['خيار ١','خيار ٢','خيار ٣']).map(o => { const selected = Array.isArray(answer.entry) ? answer.entry : []; return <label key={o}><input type="checkbox" checked={selected.includes(o)} onChange={e => update({ entry:e.target.checked ? [...selected,o] : selected.filter(x => x !== o) })}/>{o}</label>; })}</div>}
        {q.inputType === 'rating' && <div className="rating-options" dir="ltr">{[1,2,3,4,5].map(n => <button type="button" key={n} className={String(answer.entry) === String(n) ? 'selected' : ''} onClick={() => update({ entry:String(n) })} data-testid={`rating-${q.id}-${n}`}>{n}</button>)}</div>}
        {q.inputType === 'date' && <input className="typed-input" type="date" value={answer.entry as string || ''} onChange={e => update({ entry:e.target.value })} data-testid={`input-date-${q.id}`}/>}
        {q.inputType === 'photo' && <p className="typed-help">أرفق صورة من قسم الأدلة أدناه.</p>}
      </div>}
      <div className="answer-label">نتيجة الفحص <em>*</em></div><div className="answer-options">
        {[['pass','مطابق','مطابق للمعيار',Check],['fail','غير مطابق','يتطلب متابعة',X],['na','لا ينطبق','يُستبعد من النتيجة',CircleHelp]].map(([value,label,sub,Icon]) => <button type="button" key={value as string} onClick={() => { update({ value: value as string, severity: q.severity }); setMessage(''); }} className={`answer-option ${answer.value === value ? `chosen ${value}` : ''}`} data-testid={`answer-${value}-${q.id}`}><span className="choice-icon"><Icon size={18}/></span><b>{label as string}</b><small>{sub as string}</small></button>)}
      </div>
      {answer.value === 'fail' && <div className="finding-fields"><label className="field"><span>وصف الملاحظة <em>*</em></span><textarea value={answer.observation} onChange={e => update({ observation: e.target.value })} placeholder="صف ما تمت ملاحظته بوضوح…" data-testid={`input-observation-${q.id}`}/></label><div className="field-row"><label className="field"><span>درجة الخطورة</span><select value={answer.severity} onChange={e => update({ severity: e.target.value as Answer['severity'] })} data-testid={`select-severity-${q.id}`}><option value="Critical">حرج · وزن 10</option><option value="Major">رئيسي · وزن 5</option><option value="Minor">بسيط · وزن 1</option></select></label><label className="recurring-toggle"><input type="checkbox" checked={answer.recurring} onChange={e => update({ recurring: e.target.checked })} data-testid={`toggle-recurring-${q.id}`}/><span className="fake-check"><Check size={13}/></span><span>ملاحظة متكررة</span></label></div><label className="field"><span>التوصية المقترحة</span><textarea value={answer.recommendation} onChange={e => update({ recommendation: e.target.value })} placeholder="ما الإجراء الأنسب لمعالجة الملاحظة؟" data-testid={`input-recommendation-${q.id}`}/></label><button className="text-link action-create" onClick={() => setActionForm(actionForm === q.id ? null : q.id)}><Plus size={16}/> إنشاء إجراء تصحيحي</button>{actionForm === q.id && <div className="inline-action-form"><label className="field"><span>المسؤول</span><input value={responsible} onChange={e => setResponsible(e.target.value)} placeholder="اسم المسؤول"/></label><label className="field"><span>تاريخ الاستحقاق</span><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></label><Button onClick={() => addAction(q)} disabled={!answer.observation.trim()}>حفظ الإجراء</Button></div>}</div>}
      {answer.value === 'na' && <label className="field na-reason"><span>سبب عدم الانطباق <small>اختياري</small></span><textarea value={answer.observation} onChange={e => update({ observation: e.target.value })} placeholder="اكتب سبب استبعاد هذا السؤال من الزيارة…"/></label>}
      {answer.initialValue === 'fail' && answer.value === 'pass' && <div className="correction-record"><label className="recurring-toggle"><input type="checkbox" checked={Boolean(answer.correctedDuringVisit)} onChange={e => update({ correctedDuringVisit: e.target.checked })} data-testid={`toggle-corrected-${q.id}`}/><span className="fake-check"><Check size={13}/></span><span>تم تصحيح الملاحظة خلال الزيارة</span></label>{answer.correctedDuringVisit && <label className="field"><span>تفاصيل التصحيح <small>اختياري</small></span><textarea value={answer.correctionNote || ''} onChange={e => update({ correctionNote: e.target.value })} placeholder="ما الذي تم تصحيحه؟"/></label>}</div>}
      <div className="evidence-block">
        <div className="evidence-heading"><span><ImagePlus size={17}/> أدلة مصورة <small>اختياري</small></span><label className="upload-button"><Plus size={16}/> إضافة صورة<input type="file" accept="image/*" capture="environment" multiple onChange={e => { selectPhoto(e.target.files); e.currentTarget.value = ''; }} data-testid={`input-photo-${q.id}`}/></label></div>
        <p>التقط صورة بالكاميرا أو اختر من المعرض. الفيديو غير مدعوم.</p>
        {answer.attachments.length > 0 && <div className="evidence-grid">{answer.attachments.map(img => <div className="evidence-item" key={img.id}><img src={img.data} alt={img.caption || img.name}/><button onClick={() => removePhoto(img.id)} aria-label="حذف الصورة"><X size={15}/></button><input value={img.caption} onChange={e => updateCaption(img.id, e.target.value)} placeholder="أضف وصفاً للصورة"/></div>)}</div>}
      </div>
      </Card><div className="question-controls"><Button variant="outline" disabled={index === 0} onClick={() => setIndex(Math.max(0,index - 1))}><ArrowRight size={16}/> السابق</Button><span>{index + 1} / {questions.length}</span>{index < questions.length - 1 ? <Button onClick={() => { if (answer.value === null) { setMessage('اختر نتيجة السؤال قبل المتابعة.'); return; } if (answer.value === 'fail' && !answer.observation.trim()) { setMessage('أضف وصف الملاحظة قبل الانتقال.'); return; } setIndex(index + 1); setMessage(''); }} data-testid="button-next-question">التالي <ArrowLeft size={16}/></Button> : <Button onClick={() => setReview(true)} data-testid="button-review">مراجعة وإنهاء <FileCheck2 size={16}/></Button>}</div></div></div>}
    <div className="provisional-note"><Info size={15}/> معايير وعتبات الفحص الحالية أولية وقابلة للتعديل؛ لا تمثل معايير رسمية معتمدة.</div>
  </div>;
}

function BranchStats({ branch, data }: { branch: Branch; data: ReturnType<typeof useLocalData> }) {
  const history = data.inspections.filter(i => i.branchId === branch.id && i.status === 'finalized').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const latestScore = history[0] ? calculateScore(history[0].questionSnapshot, history[0].answers) : undefined;
  const openFindings = data.actions.filter(a => a.branchName === branch.name && a.status !== 'مغلق').length;
  return <div className="branch-facts"><span>{history.length} زيارات</span><span>{openFindings} إجراءات مفتوحة</span><span>آخر نتيجة {latestScore?.score == null ? '—' : `${latestScore.score}%`}</span></div>;
}

function SettingsPage({ data }: { data: ReturnType<typeof useLocalData> }) {
  const [standards, setStandards] = useState<Question[]>(QUESTIONS);
  const [standardsDirty, setStandardsDirty] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [city, setCity] = useState('');
  const [manager, setManager] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editManager, setEditManager] = useState('');
  const [savedNote, setSavedNote] = useState('');
  useEffect(() => { loadQuestions().then(setStandards).catch(() => setStandards(QUESTIONS)); }, []);
  const updateStandard = (id: number, patch: Partial<Question>) => { setStandards(old => old.map(q => q.id === id ? { ...q, ...patch } : q)); setStandardsDirty(true); };
  const saveStandards = async () => { await saveQuestions(standards); setStandardsDirty(false); setSavedNote('تم حفظ صياغات المعايير والقياسات محلياً.'); };
  const saveBranch = async (e: React.FormEvent) => { e.preventDefault(); if (!branchName.trim()) return; const b: Branch = { id: newId(), name: branchName.trim(), city: city.trim(), manager: manager.trim(), archived: false, demo: false }; await put('branches', b); setBranchName(''); setCity(''); setManager(''); await data.refresh(); };
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
    <div className="settings-layout"><div className="settings-main"><Card className="settings-card"><div className="card-heading"><div><span className="eyebrow">دليل الفروع</span><h2>الفروع</h2></div><span className="count-badge">{data.branches.filter(b => !b.archived).length} نشط</span></div><div className="demo-warning"><Info size={16}/><span>الفروع الثلاثة الأولية (المطيرفي، النسيم، الكوت) أمثلة فقط — ليست دليلاً حقيقياً للفروع.</span></div><form className="add-branch-form" onSubmit={saveBranch}><input value={branchName} onChange={e => setBranchName(e.target.value)} placeholder="اسم الفرع الجديد" aria-label="اسم الفرع" data-testid="input-branch-name"/><input value={city} onChange={e => setCity(e.target.value)} placeholder="المدينة" aria-label="المدينة" data-testid="input-branch-city"/><input value={manager} onChange={e => setManager(e.target.value)} placeholder="مدير الفرع (اختياري)" aria-label="مدير الفرع" data-testid="input-branch-manager"/><Button type="submit" disabled={!branchName.trim()} data-testid="button-add-branch"><Plus size={16}/> إضافة</Button></form>
      <div className="branch-list">{data.branches.map(b => <div className={`branch-row ${b.archived ? 'archived' : ''}`} key={b.id}>{editing === b.id ? <><input value={editName} onChange={e => setEditName(e.target.value)} aria-label="تعديل اسم الفرع"/><input value={editCity} onChange={e => setEditCity(e.target.value)} aria-label="تعديل المدينة"/><input value={editManager} onChange={e => setEditManager(e.target.value)} aria-label="تعديل مدير الفرع"/><button className="icon-button" onClick={() => commitEdit(b)} aria-label="حفظ التعديل"><Check size={17}/></button><button className="icon-button" onClick={() => setEditing(null)} aria-label="إلغاء"><X size={17}/></button></> : <><span className="branch-symbol"><Store size={18}/></span><div className="branch-name"><b>{b.name}</b><small>{b.city || 'مدينة غير محددة'}{b.manager && ` · المدير: ${b.manager}`} {b.demo && <i>مثال</i>}</small><BranchStats branch={b} data={data}/></div>{b.archived && <StatusPill>مؤرشف</StatusPill>}<button className="icon-button" onClick={() => beginEdit(b)} aria-label={`تعديل ${b.name}`} data-testid={`edit-branch-${b.id}`}><Pencil size={16}/></button><button className="icon-button" onClick={() => toggleArchive(b)} aria-label={b.archived ? 'إلغاء الأرشفة' : 'أرشفة الفرع'} data-testid={`archive-branch-${b.id}`}><Archive size={16}/></button></>}</div>)}</div>
    </Card><Card className="settings-card"><div className="card-heading"><div><span className="eyebrow">الأسئلة والأوزان</span><h2>معايير الفحص</h2></div><SlidersHorizontal size={19}/></div><div className="standards-note"><Info size={18}/><div><b>صياغة المعايير والعتبات أولية</b><p>لا توجد معايير رسمية Ratio مضمّنة. عدّل القيم المعروضة وفق اعتماد منشأتك قبل استخدامها كمرجع.</p></div></div><div className="weights-row">{[['حرج','10','red'],['رئيسي','5','amber'],['بسيط','1','green']].map(([n,v,c]) => <div key={n} className={`weight-box ${c}`}><small>{n}</small><b>{v}</b><span>وزن</span></div>)}</div><p className="small-muted">النتيجة = وزن البنود المطابقة ÷ أوزان البنود المنطبقة. تُستبعد «لا ينطبق» من الحساب. أي إخفاق حرج يغيّر التصنيف إلى «غير مقبول» دون تغيير النتيجة الرقمية.</p><div className="standards-editor-head"><b>تعريفات الأسئلة · {standards.length}</b><Button variant="outline" disabled={!standardsDirty} onClick={saveStandards} data-testid="button-save-standards">{standardsDirty ? 'حفظ التعديلات' : 'تم الحفظ'} <Check size={14}/></Button></div><div className="standards-editor">{standards.map(q => <details key={q.id} className="standard-item"><summary><span>{String(q.id).padStart(2,'0')}</span><b>{q.title}</b><small>{q.section}</small><ChevronLeft size={14}/></summary><div className="standard-fields"><label className="field wide"><span>معيار القبول / الوصف (أولي)</span><textarea value={q.criterion} onChange={e => updateStandard(q.id,{criterion:e.target.value})}/></label><div className="standard-edit-row"><label className="field"><span>نوع الإدخال</span><select value={q.inputType || 'status'} onChange={e => updateStandard(q.id,{inputType:e.target.value as Question['inputType']})}><option value="status">حالة مطابقة</option><option value="numeric">رقم</option><option value="text">نص</option><option value="single-choice">اختيار واحد</option><option value="multi-choice">اختيار متعدد</option><option value="rating">تقييم ١–٥</option><option value="date">تاريخ</option><option value="photo">صورة</option></select></label><label className="field"><span>الأهمية</span><select value={q.severity} onChange={e => updateStandard(q.id,{severity:e.target.value as Question['severity']})}><option value="Critical">حرج · 10</option><option value="Major">رئيسي · 5</option><option value="Minor">بسيط · 1</option></select></label>{q.measurement && <><label className="field"><span>الحد الأدنى · {q.measurement.unit}</span><input type="number" value={q.measurement.min} onChange={e => updateStandard(q.id,{measurement:{...q.measurement!,min:Number(e.target.value)}})}/></label><label className="field"><span>الحد الأعلى · {q.measurement.unit}</span><input type="number" value={q.measurement.max} onChange={e => updateStandard(q.id,{measurement:{...q.measurement!,max:Number(e.target.value)}})}/></label></>}</div>{['single-choice','multi-choice'].includes(q.inputType || '') && <label className="field standard-options"><span>خيارات الإجابة · افصل بينها بفاصلة عربية أو إنجليزية</span><input value={(q.options || []).join('، ')} onChange={e => updateStandard(q.id,{options:e.target.value.split(/[،,]/).map(x => x.trim()).filter(Boolean)})}/></label>}</div></details>)}</div></Card></div>
    <div className="settings-aside"><Card className="settings-card"><div className="card-heading"><div><span className="eyebrow">التخزين</span><h2>بيانات هذا الجهاز</h2></div><ShieldCheck size={20}/></div><div className="local-callout"><span className="local-status-icon"><ShieldCheck size={20}/></span><div><b>محفوظة محلياً فقط</b><p>لا تُرسل بياناتك إلى خادم ولا تتم مزامنتها مع أجهزة أخرى. حذف بيانات المتصفح قد يؤدي لفقدانها.</p></div></div><Button variant="outline" className="full-button" onClick={exportBackup} data-testid="button-export-backup"><ArrowDownToLine size={17}/> تصدير نسخة JSON</Button><label className="button button-outline full-button import-button"><Upload size={17}/> استيراد نسخة JSON<input type="file" accept="application/json,.json" onChange={e => { importBackup(e.target.files?.[0]); e.currentTarget.value = ''; }} data-testid="input-import-backup"/></label>{savedNote && <p className="backup-note" data-testid="backup-status">{savedNote}</p>}<div className="backup-count">{data.inspections.length} زيارة · {data.actions.length} إجراء · {data.branches.length} فرع</div></Card>
      <Card className="settings-card"><div className="card-heading"><div><span className="eyebrow">التثبيت</span><h2>إضافة للشاشة الرئيسية</h2></div><Activity size={19}/></div><ol className="install-steps"><li><span>١</span>افتح هذه الصفحة في Safari على iPhone.</li><li><span>٢</span>اضغط زر المشاركة في أسفل الشاشة.</li><li><span>٣</span>اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة».</li></ol><div className="video-unsupported">الفيديو غير مدعوم في هذا الإصدار.</div></Card></div></div>
    <div className="settings-footnote"><Info size={15}/> المعايير والحدود المعروضة ليست معايير رسمية معتمدة؛ راجع واعتمد القيم داخلياً قبل التطبيق.</div>
  </div>;
}

function Router() {
  const data = useLocalData();
  return <RoutedErrorBoundary><AppShell><Switch>
    <Route path="/"><HomePage data={data}/></Route>
    <Route path="/visits"><VisitsPage data={data}/></Route>
    <Route path="/actions"><ActionsPage data={data}/></Route>
    <Route path="/reports"><ReportsPage data={data}/></Route>
    <Route path="/reports/:id"><ReportDetail data={data}/></Route>
    <Route path="/settings"><SettingsPage data={data}/></Route>
    <Route path="/inspection/new"><StartInspection data={data}/></Route>
    <Route path="/inspection/:id"><InspectionRunner data={data}/></Route>
    <Route component={NotFound}/>
  </Switch></AppShell></RoutedErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><AuthGate><Router/></AuthGate></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
