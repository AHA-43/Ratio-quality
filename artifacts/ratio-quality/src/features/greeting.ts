// Home greeting: changes with the time of day and the day of the week, and some people get nicknames.

/** Extra names for a person, keyed by first name (Arabic letters normalised). Picked at random with the name itself. */
const NICKNAMES: Record<string, string[]> = {
  'راكان': ['راكان', 'بوسعيد', 'شيخ البحر', 'راكان البحر', 'أبو سعيد'],
};
const norm = (s: string) => s.trim().replace(/[إأآ]/g, 'ا').replace(/ة$/, 'ه');

type Slot = 'dawn' | 'morning' | 'noon' | 'evening' | 'night';
const slotOf = (h: number): Slot => h < 5 ? 'night' : h < 11 ? 'morning' : h < 15 ? 'noon' : h < 19 ? 'evening' : 'night';

// {n} = name. Coffee-flavoured, warm, short.
const LINES: Record<Slot | 'any', string[]> = {
  morning: ['صباح الخير يا {n}', 'صباح الورد يا {n}', 'صباحك قهوة يا {n}', 'يا صباح الهيل يا {n}', 'صباح النشاط يا {n}', 'أول شوت لك اليوم يا {n} ☕', 'صباحك مختص يا {n}'],
  noon: ['يا هلا {n}', 'ظهرك سعيد يا {n}', 'وقت الكورتادو يا {n}', 'نص اليوم وأنت بطل يا {n}', 'هلا والله بـ{n}'],
  evening: ['مساء الخير يا {n}', 'مساء الورد يا {n}', 'مساك قهوة يا {n}', 'عصرية حلوة يا {n}', 'مساء الإنجاز يا {n}', 'يا مسا الهيل يا {n}'],
  night: ['مساء النور يا {n}', 'سهرة قهوة يا {n}', 'ليلتك هادية يا {n}', 'آخر جولة لليوم يا {n}؟', 'مسا الخير يا {n}'],
  dawn: ['صباح الخير يا {n}'],
  any: ['هلا والله بـ{n}', 'حيّ الله {n}', 'نوّرت يا {n}', 'يا مرحبا بـ{n}', 'أهلاً يا {n}، جاهز للجولة؟', 'جودتك تفرق يا {n}', 'الفروع تنتظرك يا {n}', 'الله يحييك يا {n}'],
};
const FRIDAY = ['جمعة مباركة يا {n}', 'جمعتك طيبة يا {n}'];
const ANON: Record<Slot, string> = { dawn: 'صباح الخير', morning: 'صباح الخير', noon: 'يا هلا', evening: 'مساء الخير', night: 'مساء النور' };

/** A fresh greeting; stays the same for the whole app session so it does not change on every render. */
export function greetingFor(name: string | undefined, now = new Date(), rand: () => number = Math.random): string {
  const slot = slotOf(now.getHours());
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  if (!first) return ANON[slot];
  const nicks = NICKNAMES[Object.keys(NICKNAMES).find(k => norm(k) === norm(first)) ?? ''] ?? [first];
  const pool = [...LINES[slot], ...LINES[slot], ...LINES.any, ...(now.getDay() === 5 ? [...FRIDAY, ...FRIDAY] : [])];
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length) % a.length];
  return pick(pool).replace('{n}', pick(nicks));
}

export function sessionGreeting(name: string | undefined): string {
  const key = `rq-greet-${name ?? ''}`;
  try { const v = sessionStorage.getItem(key); if (v) return v; const g = greetingFor(name); sessionStorage.setItem(key, g); return g; }
  catch { return greetingFor(name); }
}
