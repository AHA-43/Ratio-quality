export function tidyArabic(t: string) {
  let s = t.replace(/\s+/g, ' ').trim();
  s = s.replace(/,/g, '،').replace(/\?/g, '؟').replace(/;/g, '؛').replace(/\s+([،.؛:!؟])/g, '$1');
  s = s.replace(/([،.؛:!؟])(?=[^\s\d])/g, '$1 ').replace(/([.!؟])\1+/g, '$1').replace(/ـ{2,}/g, '');
  if (s && !/[.!؟]$/.test(s)) s += '.';
  return s;
}
