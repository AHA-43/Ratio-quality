import type { Inspection } from '../data';
import { calculateScore } from '../scoring';

export type CardData = { branch: string; code?: string; date: string; number?: string; score: number | null; cls: string | null; delta: number | null; strengths: { name: string; pct: number }[]; issues: { title: string; sev: string }[]; criticalFailures: number };
const SEVN: Record<string, string> = { Critical: 'حرج', Major: 'رئيسي', Minor: 'ثانوي' }; const rank: Record<string, number> = { Critical: 0, Major: 1, Minor: 2 };
export function cardData(i: Inspection): CardData {
  const s = calculateScore(i.questionSnapshot, i.answers);
  const secs = [...new Set(i.questionSnapshot.map(q => q.section))].map(name => ({ name, r: calculateScore(i.questionSnapshot.filter(q => q.section === name), i.answers) })).filter(x => x.r.score !== null);
  const strengths = secs.sort((a, b) => b.r.score! - a.r.score!).slice(0, 3).map(x => ({ name: x.name, pct: Math.round(x.r.score!) }));
  const issues = i.questionSnapshot.filter(q => { const a = i.answers[q.id]; return a && (a.value === 'fail' || a.initialValue === 'fail') && a.value !== 'pass'; })
    .sort((a, b) => rank[a.severity] - rank[b.severity] || a.id - b.id).slice(0, 3).map(q => ({ title: q.title, sev: SEVN[q.severity] }));
  const delta = i.previous?.score != null && s.score != null ? +(s.score - i.previous.score).toFixed(1) : null;
  return { branch: i.branchName, code: i.branchCode, date: i.date.slice(0, 10), number: i.number, score: s.score, cls: s.classification, delta, strengths, issues, criticalFailures: s.criticalFailures };
}

const TONE: Record<string, string> = { 'ممتاز': '#3f9b6a', 'جيد': '#7584F7', 'يحتاج تحسين': '#D9A441', 'غير مقبول': '#E5584F' };
const SEVC: Record<string, string> = { 'حرج': '#E5584F', 'رئيسي': '#D9A441', 'ثانوي': '#9aa0d8' };
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, lines: number) {
  const words = text.split(' '); const out: string[] = []; let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > max && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur); if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, '') + '…'; } return out;
}
const loadImg = (src: string) => new Promise<HTMLImageElement | null>(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });

/** One-page shareable card (PNG, 1080×1350) for branch managers: score, strengths, top findings. */
export async function renderBranchCard(i: Inspection): Promise<Blob> {
  const d = cardData(i); const W = 1080, H = 1350;
  try { await Promise.all([document.fonts.load('700 40px "Thmanyah Sans"'), document.fonts.load('400 30px "Thmanyah Sans"')]); } catch { /* fall back to system font */ }
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')!;
  x.direction = 'rtl'; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
  const F = (w: number, s: number) => `${w} ${s}px "Thmanyah Sans", system-ui, sans-serif`;
  const bg = x.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#07014F'); bg.addColorStop(1, '#1b1470'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(255,255,255,.05)'; x.lineWidth = 3; for (let gx = 40; gx < W; gx += 150) for (let gy = 40; gy < H; gy += 150) { x.beginPath(); x.arc(gx, gy, 12, 0, 7); x.stroke(); x.beginPath(); x.moveTo(gx + 40, gy + 30); x.lineTo(gx + 100, gy - 30); x.stroke(); }
  const logo = await loadImg('/brand/logo-ar-white.png'); if (logo) { const h = 74; x.drawImage(logo, W - 70 - h * logo.width / logo.height, 62, h * logo.width / logo.height, h); }
  x.fillStyle = '#cfd2f5'; x.font = F(400, 30); x.textAlign = 'left'; x.fillText('بطاقة نتيجة الزيارة', 70, 112); x.textAlign = 'right';
  x.fillStyle = '#fff'; x.font = F(700, 68); wrap(x, d.branch, W - 140, 2).forEach((l, k) => x.fillText(l, W - 70, 250 + k * 80));
  const nameLines = wrap(x, d.branch, W - 140, 2).length; const top = 250 + nameLines * 80 - 20;
  x.fillStyle = '#9fa5ec'; x.font = F(400, 30); x.fillText(`${d.code ? d.code + ' · ' : ''}${d.date}${d.number ? ' · رقم ' + d.number : ''}`, W - 70, top + 30);
  // score ring
  const cx = 290, cy = top + 215, R = 130, tone = d.criticalFailures ? TONE['غير مقبول'] : (d.cls && TONE[d.cls]) || '#7584F7';
  x.lineWidth = 34; x.lineCap = 'round'; x.strokeStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
  if (d.score !== null) { x.strokeStyle = tone; x.beginPath(); x.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, d.score / 100)); x.stroke(); }
  x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = F(700, 96); x.fillText(d.score === null ? '—' : `${d.score}%`, cx, cy + 32); x.textAlign = 'right';
  // classification pill + delta
  const pillW = 400; x.fillStyle = tone; x.beginPath(); x.roundRect(W - 70 - pillW, cy - 90, pillW, 80, 40); x.fill();
  x.fillStyle = '#fff'; x.font = F(700, 42); x.textAlign = 'center'; x.fillText(d.criticalFailures ? 'غير مقبول' : (d.cls ?? 'غير مكتمل'), W - 70 - pillW / 2, cy - 36); x.textAlign = 'right';
  x.font = F(400, 32); x.fillStyle = d.delta === null ? '#9fa5ec' : d.delta >= 0 ? '#7fe0a8' : '#ff9d97';
  x.fillText(d.delta === null ? 'أول زيارة مسجلة' : `${d.delta >= 0 ? '▲ +' : '▼ '}${d.delta} نقطة عن الزيارة السابقة`, W - 70, cy + 40);
  if (d.criticalFailures) { x.fillStyle = '#ff9d97'; x.font = F(400, 28); x.fillText(`${d.criticalFailures} إخفاق حرج يلزم تصحيحه خلال 24 ساعة`, W - 70, cy + 90); }
  // sections
  let y = cy + R + 78; const block = (title: string, color: string) => { x.fillStyle = color; x.font = F(700, 40); x.fillText(title, W - 70, y); y += 22; x.strokeStyle = 'rgba(255,255,255,.15)'; x.lineWidth = 2; x.beginPath(); x.moveTo(70, y); x.lineTo(W - 70, y); x.stroke(); y += 52; };
  block('أقوى نقاط الفرع', '#7fe0a8');
  x.font = F(400, 36); d.strengths.forEach(s => { x.fillStyle = '#fff'; x.fillText(s.name, W - 70, y); x.textAlign = 'left'; x.fillStyle = '#7fe0a8'; x.font = F(700, 36); x.fillText(`${s.pct}%`, 70, y); x.font = F(400, 36); x.textAlign = 'right'; y += 56; });
  if (!d.strengths.length) { x.fillStyle = '#9fa5ec'; x.fillText('—', W - 70, y); y += 56; }
  y += 14; block('أهم ما يحتاج معالجة', '#ffb4ae');
  x.font = F(400, 34); if (!d.issues.length) { x.fillStyle = '#7fe0a8'; x.fillText('لا توجد ملاحظات. أحسنتم!', W - 70, y); y += 60; }
  d.issues.forEach(s => { x.fillStyle = SEVC[s.sev] ?? '#9aa0d8'; x.beginPath(); x.arc(W - 90, y - 12, 11, 0, 7); x.fill(); x.fillStyle = '#fff'; const ls = wrap(x, s.title, W - 230, 2); ls.forEach((l, k) => x.fillText(l, W - 124, y + k * 42)); x.textAlign = 'left'; x.fillStyle = SEVC[s.sev] ?? '#9aa0d8'; x.font = F(700, 28); x.fillText(s.sev, 70, y); x.font = F(400, 34); x.textAlign = 'right'; y += 52 + (ls.length - 1) * 42; });
  x.fillStyle = 'rgba(255,255,255,.55)'; x.font = F(400, 26); x.textAlign = 'center'; x.fillText('إدارة الجودة — ريشيو للقهوة المختصة', W / 2, H - 36);
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('png')), 'image/png'));
}
