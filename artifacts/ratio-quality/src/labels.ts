import type { Inspection } from './data';

export const workflowLabel = (i: Inspection) =>
  i.status === 'draft' ? (i.workflow === 'returned' ? 'مُعادة للتصحيح' : 'مسودة')
  : i.workflow === 'approved' ? 'معتمدة' : 'بانتظار الاعتماد';
