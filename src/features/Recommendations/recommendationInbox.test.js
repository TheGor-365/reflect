import { describe, expect, it } from 'vitest';
import { buildRecommendationInbox } from './recommendationInbox';

const at = day => ({ toDate: () => new Date('2026-11-' + day + 'T10:00:00Z') });
const make = (overrides = {}) => ({
  version: 'reflect.interaction.v1',
  stage: 'synthesize', clarifyingQuestion: '',
  insights: [], unknowns: [], recommendationCandidates: [
    { title: 'Опубликовать первый результат',
      rationale: 'В сообщении упомянут затянувшийся запуск',
      sourceRefs: ['current-message'] }
  ],
  ...overrides
});

describe('M1 source-backed recommendations inbox', () => {
  it('never invents recommendations or goals from legacy prose and garbage entries', () => {
    const result = buildRecommendationInbox([{
      id: 'eric-legacy', title: 'Тест',
      chatHistory: [
        { role: 'user', content: 'ABC бессмысленный текст' },
        { role: 'assistant', content: 'Вам следует создать 4 цели.' }
      ],
      recommendations: ['Legacy text']
    }]);
    expect(result).toEqual({ recommendations: [], clarifications: [], pendingCount: 0 });
  });

  it('collects one pending recommendation with exact provenance and archived decision', () => {
    const first = {
      id: 'session-1', title: 'Старое обсуждение',
      chatHistory: [
        { id: 'user-1', role: 'user', content: 'Я откладываю MVP' },
        { id: 'assistant-1', role: 'assistant', timestamp: at('10'),
          content: 'Шаги', interaction: make() }
      ],
      recommendationDecisions: {
        'r-assistant-1-0': { status: 'accepted', goalId: 'goal-1' }
      }
    };
    const second = {
      id: 'session-2', title: 'Новая беседа',
      chatHistory: [
        { id: 'user-2', role: 'user', content: 'Опять откладываю' },
        { id: 'assistant-2', role: 'assistant', timestamp: at('13'),
          content: 'Обсудим', interaction: make({
            recommendationCandidates: [{
              title: 'Показать MVP одному человеку', rationale: 'Это проверка гипотезы.',
              sourceRefs: ['current-message']
            }]
          }) }
      ]
    };
    const result = buildRecommendationInbox([first, second]);
    expect(result.pendingCount).toBe(1);
    expect(result.recommendations.map(x => x.status)).toEqual(['pending', 'accepted']);
    expect(result.recommendations[0]).toMatchObject({
      sessionId: 'session-2', sourceMessageId: 'user-2',
      assistantMessageId: 'assistant-2',
      title: 'Показать MVP одному человеку'
    });
    expect(result.recommendations[1].goalId).toBe('goal-1');
  });

  it('marks a single outstanding clarification and clears the badge after user follows up', () => {
    const session = {
      id: 'session-3', title: 'Разбор проблемы',
      chatHistory: [
        { id: 'user-3', role: 'user', content: 'Трудный выбор' },
        { id: 'assistant-3', role: 'assistant', content: 'Нужен факт', timestamp: at('12'),
          interaction: make({ stage: 'clarify', clarifyingQuestion: 'Какой срок важен?',
            unknowns: ['Срок запуска'], recommendationCandidates: [] }) }
      ]
    };
    expect(buildRecommendationInbox([session])).toMatchObject({
      pendingCount: 1,
      clarifications: [{ question: 'Какой срок важен?', sourceMessageId: 'user-3' }]
    });
    session.chatHistory.push({ id: 'user-4', role: 'user', content: 'Десять дней' });
    expect(buildRecommendationInbox([session]).pendingCount).toBe(0);
  });

  it('rejects a forged suggestion without current-message source or owner-authored turn', () => {
    const sessions = [{
      id: 'session-4',
      chatHistory: [{
        id: 'assistant-only', role: 'assistant',
        content: 'Сделайте всё', interaction: make()
      }, {
        id: 'user-valid', role: 'user', content: 'Вопрос'
      }, {
        id: 'assistant-forged', role: 'assistant', content: 'Ответ',
        interaction: make({
          recommendationCandidates: [{
            title: 'Опасная цель', rationale: 'Выдуманный факт',
            sourceRefs: ['external']
          }]
        })
      }]
    }];
    expect(buildRecommendationInbox(sessions).pendingCount).toBe(0);
  });
});
