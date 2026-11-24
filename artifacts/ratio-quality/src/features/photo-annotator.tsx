import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Circle, MoveUpRight, Pencil, RotateCcw, Trash2, X } from 'lucide-react';

type Tool = 'pen' | 'circle' | 'arrow';
type Stroke = { tool: Tool; color: string; pts: { x: number; y: number }[] };
const COLORS = [['#E5322D', 'أحمر'], ['#FFD23F', 'أصفر'], ['#FFFFFF', 'أبيض'], ['#7584F7', 'أزرق']] as const;
const TOOLS: [Tool, string, typeof Pencil][] = [['circle', 'دائرة', Circle], ['arrow', 'سهم', MoveUpRight], ['pen', 'قلم', Pencil]];

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, w: number) {
  ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // thin dark outline keeps white/yellow marks readable on bright photos
  const pass = (outline: boolean) => {
    ctx.strokeStyle = outline ? 'rgba(0,0,0,.55)' : s.color; ctx.lineWidth = outline ? w + 3 : w;
    const a = s.pts[0], b = s.pts[s.pts.length - 1]; ctx.beginPath();
    if (s.tool === 'pen') { ctx.moveTo(a.x, a.y); for (const p of s.pts.slice(1)) ctx.lineTo(p.x, p.y); if (s.pts.length === 1) ctx.lineTo(a.x + .1, a.y); }
    else if (s.tool === 'circle') { ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(2, Math.abs(b.x - a.x) / 2), Math.max(2, Math.abs(b.y - a.y) / 2), 0, 0, Math.PI * 2); }
    else {
      const ang = Math.atan2(b.y - a.y, b.x - a.x), head = Math.max(w * 4, 22);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - head * Math.cos(ang - .45), b.y - head * Math.sin(ang - .45));
      ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - head * Math.cos(ang + .45), b.y - head * Math.sin(ang + .45));
    }
    ctx.stroke();
  };
  pass(true); pass(false);
}

export function PhotoAnnotator({ src, onSave, onCancel }: { src: string; onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const live = useRef<Stroke | null>(null);
  const [tool, setTool] = useState<Tool>('circle'); const [color, setColor] = useState<string>(COLORS[0][0]);
  const [ready, setReady] = useState(false);
  const lw = () => Math.max(5, Math.round(Math.max(canvas.current?.width ?? 800, canvas.current?.height ?? 600) / 160));
  const paint = () => {
    const c = canvas.current, im = img.current; if (!c || !im) return; const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(im, 0, 0, c.width, c.height);
    for (const s of strokes) drawStroke(ctx, s, lw()); if (live.current) drawStroke(ctx, live.current, lw());
  };
  useEffect(() => {
    const im = new Image(); im.onload = () => {
      img.current = im; const c = canvas.current!; const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); setReady(true);
    }; im.src = src;
  }, [src]);
  useEffect(paint, [strokes, ready]);
  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; }; }, []);
  const pt = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.current!.width / r.width, y: (e.clientY - r.top) * canvas.current!.height / r.height }; };
  const down = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture(e.pointerId); live.current = { tool, color, pts: [pt(e)] }; paint(); };
  const move = (e: React.PointerEvent) => { if (!live.current) return; const p = pt(e); if (tool === 'pen') live.current.pts.push(p); else live.current.pts[1] = p; paint(); };
  const up = () => { const s = live.current; live.current = null; if (s && (s.tool === 'pen' || s.pts.length > 1)) { try { navigator.vibrate?.(6); } catch { /* ignore */ } setStrokes(x => [...x, s]); } else paint(); };
  const save = () => {
    const c = canvas.current!; if (!strokes.length) { onCancel(); return; }
    let q = .86, out = c.toDataURL('image/jpeg', q); while (out.length > 600_000 && q > .5) { q -= .08; out = c.toDataURL('image/jpeg', q); }
    onSave(out);
  };
  return createPortal(<div className="annot" role="dialog" aria-label="تعليم الصورة" dir="rtl">
    <header><button type="button" className="annot-x" onClick={onCancel}><X size={18}/> {strokes.length ? 'إلغاء' : 'تخطي'}</button><b>علّم موضع المشكلة</b><button type="button" className="annot-save" onClick={save}><Check size={18}/> {strokes.length ? 'حفظ' : 'متابعة'}</button></header>
    <div className="annot-stage">{!ready && <span className="annot-loading">جارٍ فتح الصورة…</span>}<canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}/></div>
    <footer>
      <div className="annot-tools">{TOOLS.map(([t, label, Icon]) => <button type="button" key={t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)}><Icon size={20}/><span>{label}</span></button>)}</div>
      <div className="annot-colors">{COLORS.map(([c, n]) => <button type="button" key={c} aria-label={n} className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)}/>)}</div>
      <div className="annot-edit"><button type="button" disabled={!strokes.length} onClick={() => setStrokes(s => s.slice(0, -1))}><RotateCcw size={18}/><span>تراجع</span></button><button type="button" disabled={!strokes.length} onClick={() => setStrokes([])}><Trash2 size={18}/><span>مسح</span></button></div>
    </footer>
  </div>, document.body);
}
