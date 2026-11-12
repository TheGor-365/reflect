import { describe, expect, it } from 'vitest';
import { summarizeDashboard } from './dashboardModel';

const day = (d, hour = 12) => new Date(2026, 10, d, hour);
const session = {
  id: 's1', chatHistory: [
    { id: 'u1', role: 'user', content: 'Я хочу начать читать' },
    { id: 'a1', role: 'assistant', content: 'Модель предложила',
      interaction: { version: 'reflect.interaction.v1',
        recommendationCandidates: [{
          title: 'Начать с 20 минут', rationale: 'Проверяемый маленький шаг'
        }]
      }
    }
  ],
  recommendationDecisions: {
    'r-a1-0': {
      status: 'accepted', assistantMessageId: 'a1',
      candidateIndex: 0, title: 'Начать с 20 минут',
      decidedAt: day(10)
    }
  },
  returnCheckIns: [{
    id: 'v1', type: 'return-check-in', author: 'user',
    text: 'Два вечера прочитал, третий пропустил',
    recordedAtClient: day(11)
  }]
};
const goals = [{
  id: 'g1', sessionId: 's1', text: 'Прочитать книгу',
  status: 'active', completed: false,
  subItems: [
    { id: 'a', text: 'Открыть книгу', completed: true },
    { id: 'b', text: 'Прочитать главу', completed: false }
  ]
}];
const fixture = {
  sessions: [session], goals,
  diaryNotes: [{
    id: 'n1', title: 'Мой план', createdAt: day(11),
    entries: [{ text: 'Заметка от меня', createdAt: day(11) },
      { text: 'Правка', createdAt: day(12) }]
  }, { id: 'undated', entries: [{ text: 'Старая заметка без даты' }] }],
  moods: [{ id: 'm1', mood: 'content', createdAt: day(12) }],
  nowMs: day(12).getTime()
};
describe('PRODUCT-05A factual Dashboard', () => {
  it('counts only dated authored events in 7-day window with explicit denominator', () => {
    const report = summarizeDashboard(fixture);
    expect(report.days).toBe(7);
    expect(report.datedActions).toBe(4);
    expect(report.totals).toEqual({ note: 1, mood: 1, decision: 1, return: 1 });
    expect(report.observedDays).toBe(3);
    expect(report.byDay).toHaveLength(7);
    expect(report.byDay.reduce((sum, date) => sum + date.count, 0)).toBe(4);
    expect(report.undatedActions).toBe(1);
    expect(report.allSteps).toBe(2);
    expect(report.completedSteps).toBe(1);
    expect(report.currentGoals).toHaveLength(1);
    expect(report.nextSteps).toEqual([{
      goalId: 'g1', goalTitle: 'Прочитать книгу',
      stepIndex: 1, text: 'Прочитать главу'
    }]);
    expect(report.emptyAccount).toBe(false);
  });

  it('uses a real 30-calendar-day period without counting stale or future events', () => {
    const older = {
      id: 'old', title: 'Октябрьская запись',
      entries: [{ text: 'Старый текст', createdAt: new Date(2026, 9, 30, 12) }]
    };
    const future = { id: 'future', title: 'Будущая запись',
      createdAt: new Date(2026, 10, 20, 12),
      entries: [{ text: 'Потом' }] };
    const long = summarizeDashboard({
      ...fixture, days: 30,
      diaryNotes: [...fixture.diaryNotes, older, future]
    });
    const short = summarizeDashboard({
      ...fixture, days: 7,
      diaryNotes: [...fixture.diaryNotes, older, future]
    });
    expect(long.datedActions).toBe(5);
    expect(short.datedActions).toBe(4);
    expect(long.byDay).toHaveLength(30);
    expect(short.byDay).toHaveLength(7);
  });

  it('does not fabricate a percentage or time-series completion from undated step status', () => {
    const report = summarizeDashboard({
      sessions: [], goals: [{ id: 'g1', text: 'Найти направление',
        subItems: [{ text: 'Начать', completed: true }] }],
      diaryNotes: [], moods: [], nowMs: day(12).getTime()
    });
    expect(report.datedActions).toBe(0);
    expect(report.completedSteps).toBe(1);
    expect(report.allSteps).toBe(1);
    expect(report.totals.decision).toBe(0);
  });

  it('does not count an AI proposal without saved acceptance or a fabricated return', () => {
    const withoutConfirmation = {
      ...session, recommendationDecisions: {}, returnCheckIns: [{
        id: 'made-up', type: 'return-check-in',
        author: 'assistant', text: 'Не настоящий результат',
        recordedAtClient: day(12)
      }]
    };
    const report = summarizeDashboard({
      sessions: [withoutConfirmation], goals: [], diaryNotes: [], moods: [],
      nowMs: day(12).getTime()
    });
    expect(report.datedActions).toBe(0);
    expect(report.totals.decision).toBe(0);
    expect(report.totals.return).toBe(0);
  });

  it('gives a genuinely empty account honest zero-evidence state', () => {
    const report = summarizeDashboard({ nowMs: day(12).getTime() });
    expect(report.emptyAccount).toBe(true);
    expect(report.observedDays).toBe(0);
    expect(report.allSteps).toBe(0);
    expect(report.recentEvents).toEqual([]);
  });
});
