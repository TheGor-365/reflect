import { describe, expect, it } from 'vitest';
import { buildSessionChronology } from './SessionTable';

describe('PRODUCT-02 journey factual event projection', () => {
  it('shows only confirmed decisions and goals, not unsaved AI suggestions', () => {
    const session = {
      id: 's1', chatHistory: [
        { id: 'u1', role: 'user', content: 'Выбор' },
        { id: 'a1', role: 'assistant', content: 'Обсудим варианты', interaction: {
          version: 'reflect.interaction.v1', recommendationCandidates: [
            { title: 'Не принято', rationale: 'Вариант' }
          ]
        } }
      ],
      recommendationDecisions: {
        'r-a1-0': {
          status: 'accepted', title: 'Проверить подход',
          decidedAt: { seconds: 1000 }
        }
      }
    };
    const goals = [{
      id: 'g1', text: 'Проверить подход', sessionId: 's1',
      createdAt: { seconds: 2000 }, completed: false
    }, { id: 'other', text: 'Чужая тема', sessionId: 's2' }];
    const events = buildSessionChronology(session, goals);
    expect(events.some(e => e.type === 'Решение принято' &&
      e.content === 'Проверить подход')).toBe(true);
    expect(events.some(e => e.type === 'Цель' &&
      e.content.includes('Проверить подход'))).toBe(true);
    expect(events.some(e => e.content.includes('Не принято'))).toBe(false);
    expect(events.some(e => e.content.includes('Чужая тема'))).toBe(false);
    expect(events.some(e => e.type === 'Цель выполнена')).toBe(false);
  });
  it('preserves legacy sessions without decisions', () => {
    const events = buildSessionChronology({
      id: 'legacy', chatHistory: [{ role: 'user', content: 'Моя запись' }]
    }, []);
    expect(events).toHaveLength(1);
    expect(events[0].content).toBe('Моя запись');
  });
});
