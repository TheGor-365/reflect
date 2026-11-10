import { describe, expect, it } from 'vitest';
import {
  buildSessionLibrary, readableSessionDate, searchSessionLibrary
} from './sessionLibrary';

const timestamp = iso => ({ toDate: () => new Date(iso) });

describe('saved-session library (read-only)', () => {
  it('sorts safely across timestamps, preserves undated sessions and does not fabricate returns', () => {
    const sessions = [
      { id: 'old', title: 'Сеанс от 9.11.2026, 10:00:00', createdAt: timestamp('2026-11-09T09:00:00Z'),
        chatHistory: [{ role: 'user', content: 'Как изменить привычку?' }] },
      { id: 'new', title: 'Заметить результат', createdAt: { seconds: 1794326400 },
        chatHistory: [
          { role: 'user', content: 'Я сделал первый шаг' },
          { role: 'assistant', content: 'Вы описали конкретное действие' }
        ] },
      { id: 'broken', title: 'Без даты', createdAt: { toDate: () => { throw Error('bad'); } },
        chatHistory: [] }
    ];
    const items = buildSessionLibrary(sessions);
    expect(items.map(item => item.id)).toEqual(['new', 'old', 'broken']);
    expect(items[0]).toMatchObject({
      title: 'Заметить результат', messageCount: 2, answerCount: 1,
      question: 'Я сделал первый шаг', reflection: 'Вы описали конкретное действие'
    });
    expect(items[1]).toMatchObject({
      title: 'Размышление с Reflect', messageCount: 1, answerCount: 0
    });
    expect(items[2].dateLabel).toBe('Дата не указана');
    expect(items[0]).not.toHaveProperty('resumeCount');
  });

  it('searches only content already present in owner-fetched sessions', () => {
    const items = buildSessionLibrary([
      { id: 'a', title: 'Путь к переменам', chatHistory: [
        { role: 'user', content: 'Мой старт' },
        { role: 'assistant', content: 'Первый небольшой шаг' }
      ] },
      { id: 'b', title: 'Успокоиться', chatHistory: [
        { role: 'user', content: 'Нужна пауза' }
      ] }
    ]);
    expect(searchSessionLibrary(items, 'небольшой').map(s => s.id)).toEqual(['a']);
    expect(searchSessionLibrary(items, 'ПАУЗА').map(s => s.id)).toEqual(['b']);
    expect(searchSessionLibrary(items, '', 'with-answer').map(s => s.id)).toEqual(['a']);
    expect(searchSessionLibrary(items, '', 'without-answer').map(s => s.id)).toEqual(['b']);
    expect(searchSessionLibrary(items, 'несуществующая тема')).toHaveLength(0);
  });

  it('rejects invalid dates and never fails on mixed legacy values', () => {
    expect(readableSessionDate(null)).toBeNull();
    expect(readableSessionDate('not-a-date')).toBeNull();
    expect(readableSessionDate({ toDate() { throw new Error('legacy'); } })).toBeNull();
    expect(readableSessionDate(timestamp('2026-11-10T12:00:00Z'))).toBeInstanceOf(Date);
    expect(buildSessionLibrary([null, {}, { id: '', title: 'blank' }])).toEqual([]);
  });
});
