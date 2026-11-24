import type { ActionItem } from '../data';
const today = () => new Date().toISOString().slice(0, 10);
export const isOverdue = (a: ActionItem) => a.status !== 'مغلق' && Boolean(a.dueDate) && a.dueDate < today();
