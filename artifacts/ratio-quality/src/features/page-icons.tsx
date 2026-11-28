// One icon per page/section title, so headers are recognisable at a glance.
import { Activity, Bell, CalendarCheck, ClipboardCheck, ClipboardList, Coffee, FileCheck2, FileText, Gauge, History, Map as MapIcon, MapPin, Settings, ShieldCheck, Sparkles, Store, Target, Users, Wrench, type LucideIcon } from 'lucide-react';

const BY_TITLE: [RegExp, LucideIcon][] = [
  [/الزيارات الأخيرة|سجل الزيارات|^الزيارات/, History], [/التقارير|تقرير/, FileCheck2], [/الإجراءات|إجراء/, ClipboardList],
  [/الفروع|فرع/, Store], [/الأولويات|أكثر البنود|نقاط التركيز/, Target], [/خطة الأسبوع|اقتراح اليوم|أولى بالزيارة/, CalendarCheck],
  [/لوحة الإدارة|الخلاصة|هدف/, Gauge], [/لوحة الأداء|تحليلات|المواضيع/, Activity], [/الباريستا/, Coffee], [/المعدات|الصيانة/, Wrench],
  [/المستخدم|الصلاحيات|الأدوار/, Users], [/الأدلة|البريد|المستلمين/, Bell], [/الإعدادات|التخزين|السحابة|المساحة/, Settings],
  [/بيانات الجولة|زيارة جديدة/, MapPin], [/خريطة/, MapIcon], [/الشهري/, FileText], [/استيراد|السجل التاريخي/, Sparkles], [/أمان|التحقق/, ShieldCheck],
];
export function iconFor(text: string): LucideIcon { return BY_TITLE.find(([re]) => re.test(text))?.[1] ?? ClipboardCheck; }

/** Small rounded icon badge used in page and card headings. */
export function HeadIcon({ text, icon, size = 18 }: { text?: string; icon?: LucideIcon; size?: number }) {
  const Icon = icon ?? iconFor(text ?? '');
  return <span className="head-ico" aria-hidden><Icon size={size}/></span>;
}
