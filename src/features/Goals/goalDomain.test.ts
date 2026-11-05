import { describe, expect, it } from 'vitest';
import {
  dateLabel, dueDayOf, dueState, isDateOnly, localNoonForDueDay,
  locateSubtask, moveDueDay, nextSubtasks, progressOf, statusOf
} from './goalDomain';

describe('backward-compatible goals domain', () => {
  it('respects explicit status, with completed legacy fallback', () => {
    expect(statusOf({ completed: true })).toBe('completed');
    expect(statusOf({ completed: false })).toBe('active');
    expect(statusOf({ status: 'paused', completed: true })).toBe('paused');
    expect(statusOf({ status: 'completed' })).toBe('completed');
  });

  it('counts only checked steps and never invents progress when empty', () => {
    expect(progressOf({ subItems: [{ completed: true }, { completed: false }, {}] }))
      .toEqual({ done: 1, total: 3, percent: 33 });
    expect(progressOf({ type: 'reflection' }))
      .toEqual({ done: 0, total: 0, percent: null });
  });

  it('parses local calendar dates without UTC midnight drift', () => {
    expect(isDateOnly('2026-11-06')).toBe(true);
    expect(isDateOnly('2026-02-30')).toBe(false);
    expect(isDateOnly('2024-02-29')).toBe(true);
    const date = localNoonForDueDay('2026-11-06')!;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(10);
    expect(date.getDate()).toBe(6);
    expect(date.getHours()).toBe(12);
    expect(dateLabel('2026-11-06')).toMatch(/6 ноябр/i);
  });

  it('advances date-only values across month and leap-year boundaries', () => {
    expect(moveDueDay('2024-02-28', 2)).toBe('2024-03-01');
    expect(moveDueDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(moveDueDay('2026-99-10', 3)).toBeNull();
  });

  it('recognizes new strings and legacy Firestore Timestamp without mutation', () => {
    const legacy = { dueDate: { toDate: () => new Date(2026, 10, 6, 12) } };
    expect(dueDayOf({ dueDay: '2026-11-07', ...legacy })).toBe('2026-11-07');
    expect(dueDayOf({ date: '2026-11-05', ...legacy })).toBe('2026-11-05');
    expect(dueDayOf(legacy)).toBe('2026-11-06');
    expect(dueDayOf({})).toBeNull();
  });

  it('overdue status is informational and never applied to completed goals', () => {
    expect(dueState({ dueDay: '2026-11-01' }, '2026-11-06')).toBe('overdue');
    expect(dueState({ dueDay: '2026-11-06' }, '2026-11-06')).toBe('today');
    expect(dueState({ dueDay: '2026-11-07' }, '2026-11-06')).toBe('upcoming');
    expect(dueState({ dueDay: '2026-11-01', completed: true }, '2026-11-06')).toBe('none');
  });

  it('toggles a nested task without mutating any frozen source record', () => {
    const sub = Object.freeze({ id: 'a', text: 'Шаг', completed: false, extra: 'keep' });
    const items = Object.freeze([sub]);
    const result = nextSubtasks([...items], { id: 'a' }, { kind: 'toggle', completed: true });
    expect(result).toEqual([{ id: 'a', text: 'Шаг', completed: true, extra: 'keep' }]);
    expect(items[0]!.completed).toBe(false);
  });

  it('edits and removes legacy subtasks by guarded index+text', () => {
    const items = [{ text: 'Первый', completed: false }, { text: 'Второй', completed: true }];
    expect(locateSubtask(items, { index: 1, text: 'Второй' })).toBe(1);
    const edited = nextSubtasks(items, { index: 0, text: 'Первый' },
      { kind: 'edit', text: 'Переименован' });
    expect(edited[0]!.text).toBe('Переименован');
    expect(items[0]!.text).toBe('Первый');
    const removed = nextSubtasks(items, { index: 1, text: 'Второй' }, { kind: 'delete' });
    expect(removed).toHaveLength(1);
    expect(items).toHaveLength(2);
  });

  it('rejects stale index edits instead of corrupting another item', () => {
    expect(() => nextSubtasks([{ text: 'Другой' }], { index: 0, text: 'Старый' },
      { kind: 'toggle', completed: true })).toThrow('Подзадача изменилась');
    expect(() => nextSubtasks([], { id: 'gone' },
      { kind: 'delete' })).toThrow('Подзадача изменилась');
  });
});
