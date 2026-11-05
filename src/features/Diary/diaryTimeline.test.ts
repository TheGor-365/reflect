import { describe, expect, it } from 'vitest';
import {
  buildDiaryTimeline, filterDiaryTimeline, groupDiaryTimeline,
  localCalendarKey, timestampDate
} from './diaryTimeline';

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe('schema-preserving diary event timeline', () => {
  it('groups 01:00 Armenian local time on the correct day, not UTC day', () => {
    const date = new Date('2026-11-04T21:00:00.000Z');
    expect(localCalendarKey(date, 'Asia/Yerevan')).toBe('2026-11-05');
    expect(localCalendarKey(date, 'UTC')).toBe('2026-11-04');
    const events = buildDiaryTimeline({
      moods: [{ id: 'm1', mood: 'content', createdAt: ts('2026-11-04T21:00:00Z') }]
    });
    expect(groupDiaryTimeline(events, 'Asia/Yerevan')[0].key).toBe('2026-11-05');
  });

  it('uses timezone-aware calendar components through DST transitions', () => {
    expect(localCalendarKey(new Date('2026-03-08T04:30:00Z'), 'America/New_York'))
      .toBe('2026-03-07');
    expect(localCalendarKey(new Date('2026-03-08T07:30:00Z'), 'America/New_York'))
      .toBe('2026-03-08');
  });

  it('keeps later session-linked goals on their own event dates', () => {
    const events = buildDiaryTimeline({
      sessions: [{ id: 's1', title: 'Сеанс', createdAt: ts('2026-11-01T09:00:00Z') }],
      goals: [{ id: 'g1', sessionId: 's1', text: 'Цель', createdAt: ts('2026-11-04T09:00:00Z') }]
    });
    expect(events.map(e => e.eventKey)).toEqual(['goal:g1', 'session:s1']);
    expect(events[0].parentSessionId).toBe('s1');
    expect(groupDiaryTimeline(events, 'Asia/Yerevan').map(g => g.key))
      .toEqual(['2026-11-04', '2026-11-01']);
  });

  it('projects appended journal entries individually, without parent duplication', () => {
    const entries = [
      { text: 'Первоначальная мысль', createdAt: ts('2026-11-01T10:00:00Z') },
      { text: 'Дополнение позже', createdAt: ts('2026-11-05T10:00:00Z') }
    ];
    const note = { id: 'n1', title: 'Личная заметка', entries,
      createdAt: ts('2026-11-01T10:00:00Z') };
    const source = JSON.stringify(note);
    const events = buildDiaryTimeline({ diaryNotes: [note] });
    expect(events.map(e => e.eventKey))
      .toEqual(['note:n1:entry:1', 'note:n1:entry:0']);
    expect(events[0].data.entries).toEqual([entries[1]]);
    expect(events[0].isAppend).toBe(true);
    expect(events[0].sourceId).toBe('n1');
    expect(JSON.stringify(note)).toBe(source);
  });

  it('uses the reflection timestamp rather than its goal parent timestamp', () => {
    const events = buildDiaryTimeline({
      goals: [{
        id: 'g1', type: 'reflection', createdAt: ts('2026-10-01T08:00:00Z'),
        reflections: [{ text: 'Поздний вывод', createdAt: ts('2026-11-05T08:00:00Z') }]
      }]
    });
    expect(events).toHaveLength(2);
    expect(events[0].eventKey).toBe('goal:g1:reflection:0');
    expect(events[0].data.reflections).toHaveLength(1);
    expect(events[1].data.reflections).toHaveLength(0);
  });

  it('retains undated and pending events in an explicit last group', () => {
    const events = buildDiaryTimeline({
      diaryNotes: [{ id: 'pending', entries: [{ text: 'Часы ещё не получены' }] }],
      moods: [{ id: 'dated', createdAt: ts('2026-11-05T08:00:00Z') }]
    });
    const groups = groupDiaryTimeline(events, 'Asia/Yerevan');
    expect(groups).toHaveLength(2);
    expect(groups[1].key).toBe('undated');
    expect(groups[1].entries[0].isPending).toBe(true);
    expect(groups[1].title).toContain('Без даты');
  });

  it('orders timestamp ties deterministically by stable event key', () => {
    const first = buildDiaryTimeline({
      moods: [
        { id: 'z', createdAt: ts('2026-11-05T08:00:00Z') },
        { id: 'a', createdAt: ts('2026-11-05T08:00:00Z') }
      ]
    });
    expect(first.map(e => e.eventKey)).toEqual(['mood:a', 'mood:z']);
  });

  it('searches only the already loaded event data and supports kind filters', () => {
    const events = buildDiaryTimeline({
      diaryNotes: [{ id: 'n', entries: [{ text: 'Приватный синтетический текст' }] }],
      moods: [{ id: 'm', comment: 'Обычный день' }]
    });
    expect(filterDiaryTimeline(events, { kind: 'note', query: 'СИНТЕТИЧЕСКИЙ' }))
      .toHaveLength(1);
    expect(filterDiaryTimeline(events, { kind: 'mood', query: 'синтетический' }))
      .toHaveLength(0);
    expect(filterDiaryTimeline(events, { query: 'отсутствующий запрос' }))
      .toHaveLength(0);
  });

  it('filters inclusive local calendar date ranges and excludes undated events', () => {
    const events = buildDiaryTimeline({
      moods: [
        { id: 'early', createdAt: ts('2026-11-04T19:00:00Z') },
        { id: 'newday', createdAt: ts('2026-11-04T21:00:00Z') },
        { id: 'undated' }
      ]
    });
    const filtered = filterDiaryTimeline(events, {
      from: '2026-11-05', to: '2026-11-05', timeZone: 'Asia/Yerevan'
    });
    expect(filtered.map(e => e.eventKey)).toEqual(['mood:newday']);
  });

  it('does not discard malformed dates or throw on partially shaped records', () => {
    const unreadable = { toDate: () => { throw new Error('bad timestamp'); } };
    expect(timestampDate(unreadable)).toBeNull();
    expect(timestampDate({ toDate: () => new Date('invalid') })).toBeNull();
    const events = buildDiaryTimeline({
      sessions: [{ id: 's', createdAt: unreadable, chatHistory: null }],
      diaryNotes: [{ id: 'n', entries: [null, { text: 'Без даты' }] }]
    });
    expect(events).toHaveLength(3);
    expect(groupDiaryTimeline(events)[0].key).toBe('undated');
  });

  it('preserves read-only input objects, including frozen nested arrays', () => {
    const first = Object.freeze({
      text: 'Безопасная запись', createdAt: ts('2026-11-01T10:00:00Z')
    });
    const items = Object.freeze([first]);
    const note = Object.freeze({ id: 'n1', entries: items, title: 'Заголовок' });
    const events = buildDiaryTimeline({ diaryNotes: [note] });
    expect(events[0].data.entries).toEqual([first]);
    expect(note.entries).toBe(items);
  });
});
