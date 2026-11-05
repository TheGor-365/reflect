/**
 * Stage 02C: backward-compatible projections of goal documents.
 * These functions never mutate Firestore snapshots or infer task completion
 * from a journal reflection or a deadline.
 */
export type GoalStatus = 'active' | 'paused' | 'completed';
type Legacy = Record<string, unknown>;
export type GoalProgress = { done: number; total: number; percent: number | null };

export function statusOf(goal: Legacy): GoalStatus {
  if (goal.status === 'active' || goal.status === 'paused' || goal.status === 'completed') {
    return goal.status;
  }
  return goal.completed === true ? 'completed' : 'active';
}

export function progressOf(goal: Legacy): GoalProgress {
  const items = Array.isArray(goal.subItems) ? goal.subItems : [];
  const done = items.filter(item => item && typeof item === 'object' &&
    (item as Legacy).completed === true).length;
  return { done, total: items.length, percent: items.length
    ? Math.round((done / items.length) * 100) : null };
}

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day || year < 1000) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export function localNoonForDueDay(day: string): Date | null {
  if (!isDateOnly(day)) return null;
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 12, 0, 0, 0);
}

export function moveDueDay(day: string, days: number): string | null {
  if (!isDateOnly(day) || !Number.isSafeInteger(days)) return null;
  const [year, month, date] = day.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, date));
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dueDayOf(goal: Legacy): string | null {
  if (isDateOnly(goal.dueDay)) return goal.dueDay;
  if (isDateOnly(goal.date)) return goal.date;
  const ts = goal.dueDate;
  if (!ts || typeof ts !== 'object' || !('toDate' in ts) ||
      typeof ts.toDate !== 'function') return null;
  try {
    const date = ts.toDate();
    return date instanceof Date && Number.isFinite(date.getTime())
      ? localDay(date) : null;
  } catch {
    return null;
  }
}

export function dueState(goal: Legacy, today: string): 'none' | 'upcoming' | 'today' | 'overdue' {
  const due = dueDayOf(goal);
  if (!due || !isDateOnly(today)) return 'none';
  if (statusOf(goal) === 'completed') return 'none';
  if (due === today) return 'today';
  return due < today ? 'overdue' : 'upcoming';
}

export function dateLabel(day: string | null): string {
  if (!day || !isDateOnly(day)) return 'Без срока';
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** The index+text guard is for legacy subtasks without IDs. */
export function locateSubtask(items: unknown[], target: { id?: string; index?: number; text?: string }): number {
  if (typeof target.id === 'string' && target.id.length) {
    return items.findIndex(item => item && typeof item === 'object' &&
      (item as Legacy).id === target.id);
  }
  const index = target.index;
  if (typeof index !== 'number' || !Number.isSafeInteger(index) ||
      index < 0 || index >= items.length) return -1;
  const item = items[index];
  if (!item || typeof item !== 'object' ||
      (item as Legacy).text !== target.text) return -1;
  return index;
}

export function nextSubtasks(items: unknown[], target: { id?: string; index?: number; text?: string },
  action: { kind: 'toggle'; completed: boolean } |
    { kind: 'edit'; text: string } | { kind: 'delete' }): Legacy[] {
  const index = locateSubtask(items, target);
  if (index < 0) throw new Error('Подзадача изменилась в другом окне. Обновите список и повторите.');
  const list = items.map(value => ({ ...(value as Legacy) }));
  if (action.kind === 'delete') return list.filter((_, i) => i !== index);
  if (action.kind === 'toggle') list[index] = { ...list[index], completed: action.completed };
  if (action.kind === 'edit') {
    const text = action.text.trim();
    if (!text) throw new Error('Текст подзадачи не может быть пустым.');
    list[index] = { ...list[index], text };
  }
  return list;
}
