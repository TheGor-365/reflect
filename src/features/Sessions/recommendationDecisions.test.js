import { beforeEach, describe, expect, it, vi } from 'vitest';
import { doc, runTransaction } from 'firebase/firestore';
import { applyRecommendationDecision } from './recommendationDecisions';

vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, root, kind, id) => ({ path: `${root}/${kind}/${id}` })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ serverTime: true })),
  Timestamp: { fromDate: vi.fn(date => ({ date })) }
}));
const userMessage = { id: 'user-request1234567890', role: 'user', content: 'Хочу начать' };
const assistantMessage = {
  id: 'assistant-request1234567890', role: 'assistant',
  interaction: {
    version: 'reflect.interaction.v1',
    stage: 'synthesize', clarifyingQuestion: '',
    unknowns: [], insights: [],
    recommendationCandidates: [{
      title: 'Начать с короткого шага',
      rationale: 'Пользователь описал трудность с началом действия.',
      sourceRefs: ['current-message']
    }]
  }
};
const params = {
  userId: 'synthetic-user', sessionId: 'saved-session',
  assistantMessageId: assistantMessage.id, candidateIndex: 0,
  goalStep: 'Сделать первый проверяемый шаг',
  goalCriteria: 'Шаг завершён и проверен мной'
};
let session, goal, writes;
beforeEach(() => {
  vi.clearAllMocks();
  session = { chatHistory: [
    { ...userMessage },
    { ...assistantMessage,
      interaction: {
        ...assistantMessage.interaction,
        unknowns: [], insights: [],
        recommendationCandidates:
          assistantMessage.interaction.recommendationCandidates.map(v => ({ ...v }))
      }
    }
  ] };
  goal = null;
  writes = [];
  runTransaction.mockImplementation(async (_db, callback) => {
    const tx = {
      get: vi.fn(async ref => {
        const data = ref.path.includes('/sessions/') ? session : goal;
        return { exists: () => data !== null, data: () => data };
      }),
      set: vi.fn((ref, payload) => {
        goal = payload;
        writes.push({ kind: 'set', path: ref.path });
      }),
      update: vi.fn((ref, payload) => {
        session = { ...session, ...payload };
        writes.push({ kind: 'update', path: ref.path });
      })
    };
    return callback(tx);
  });
});
describe('PRODUCT-02 owner-scoped recommendation decision transaction', () => {
  it('saves idea only after a user click, with source provenance and no goal', async () => {
    const saved = await applyRecommendationDecision({ ...params, action: 'saved' });
    expect(saved.status).toBe('saved');
    expect(saved.sourceMessageId).toBe(userMessage.id);
    expect(saved.assistantMessageId).toBe(assistantMessage.id);
    expect(writes).toEqual([{
      kind: 'update',
      path: 'artifacts/reflect-8fdc8/users/synthetic-user/sessions/saved-session'
    }]);
    expect(goal).toBeNull();
  });
  it('is idempotent for repeat decision; accepts postpone and dismiss as explicit changes', async () => {
    await applyRecommendationDecision({ ...params, action: 'saved' });
    await applyRecommendationDecision({ ...params, action: 'saved' });
    expect(writes).toHaveLength(1);
    await applyRecommendationDecision({ ...params, action: 'postponed' });
    await applyRecommendationDecision({ ...params, action: 'dismissed' });
    expect(writes).toHaveLength(3);
    expect(Object.values(session.recommendationDecisions)[0].status).toBe('dismissed');
  });
  it('atomically creates one user-confirmed goal linked to the session and source turn', async () => {
    const result = await applyRecommendationDecision({
      ...params, action: 'goal', goalId: 'stable-goal',
      goalTitle: '  Выпустить MVP  ', goalPurpose: 'Маленькая проверяемая версия'
    });
    expect(result.status).toBe('accepted');
    expect(result.goalId).toBe('stable-goal');
    expect(writes.map(write => write.kind)).toEqual(['set', 'update']);
    expect(goal.text).toBe('Выпустить MVP');
    expect(goal.sessionId).toBe('saved-session');
    expect(goal.sourceMessageId).toBe(userMessage.id);
    expect(goal.sourceAssistantMessageId).toBe(assistantMessage.id);
    expect(goal.completed).toBe(false);
    expect(goal.subItems).toEqual([{
      id: 'stable-goal-step-0', text: params.goalStep, completed: false
    }]);
    expect(doc).toHaveBeenCalledWith(expect.anything(),
      'artifacts/reflect-8fdc8/users/synthetic-user', 'goals', 'stable-goal');
    await applyRecommendationDecision({
      ...params, action: 'goal', goalId: 'some-new-id',
      goalTitle: 'Тоже самое'
    });
    expect(writes).toHaveLength(2);
    await expect(applyRecommendationDecision({ ...params, action: 'dismissed' }))
      .rejects.toThrow(/уже стала целью/);
  });
  it('M6c: a deleted accepted goal remains accepted history and cannot be silently recreated', async () => {
    await applyRecommendationDecision({
      ...params, action: 'goal', goalId: 'removed-goal',
      goalTitle: 'Шаг по моему выбору'
    });
    const key = Object.keys(session.recommendationDecisions)[0];
    const decision = session.recommendationDecisions[key];
    decision.goalRemovedAt = { seconds: 123 };
    const previousWrites = writes.length;
    const repeated = await applyRecommendationDecision({
      ...params, action: 'goal', goalId: 'new-goal-id',
      goalTitle: 'Не создавать дубликат'
    });
    expect(repeated.status).toBe('accepted');
    expect(repeated.goalId).toBe('removed-goal');
    expect(repeated.goalRemovedAt).toEqual({ seconds: 123 });
    expect(writes).toHaveLength(previousWrites);
    expect(goal.text).toBe('Шаг по моему выбору');
  });

  it('does not write for unsaved, altered, or ungrounded AI proposals', async () => {
    session = null;
    await expect(applyRecommendationDecision({ ...params, action: 'goal',
      goalId: 'target', goalTitle: 'Target' })).rejects.toThrow(/Сначала сохраните/);
    session = { chatHistory: [userMessage, assistantMessage] };
    await expect(applyRecommendationDecision({ ...params, assistantMessageId: 'assistant-missing',
      action: 'saved' })).rejects.toThrow(/отсутствует/);
    session = { chatHistory: [assistantMessage] };
    await expect(applyRecommendationDecision({ ...params, action: 'saved' }))
      .rejects.toThrow(/отсутствует/);
    session = { chatHistory: [userMessage, assistantMessage] };
    await expect(applyRecommendationDecision({ ...params, action: 'goal',
      goalId: 'target', goalTitle: '' })).rejects.toThrow(/Проверьте/);
    expect(writes).toHaveLength(0);
  });
  it('rejects path injection and only writes to the current UID subtree', async () => {
    await expect(applyRecommendationDecision({
      ...params, userId: 'user/other', action: 'saved'
    })).rejects.toThrow(/безопасного контекста/);
    await expect(applyRecommendationDecision({
      ...params, sessionId: '../other', action: 'saved'
    })).rejects.toThrow(/безопасного контекста/);
    expect(writes).toHaveLength(0);
  });
});

it('persists authored first step, optional local-date deadline and success criterion', async () => {
  await applyRecommendationDecision({
    ...params, action: 'goal', goalId: 'g-with-step',
    goalTitle: 'Первый шаг к MVP', goalPurpose: 'Проверить гипотезу',
    goalStep: 'Развернуть минимальный прототип',
    goalDueDay: '2026-12-01', goalCriteria: 'Проверяется открытием URL'
  });
  expect(goal.subItems).toEqual([{
    id: 'g-with-step-step-0', text: 'Развернуть минимальный прототип', completed: false
  }]);
  expect(goal.dueDay).toBe('2026-12-01');
  expect(goal.dueDate.date).toBeInstanceOf(Date);
  expect(goal.dueDate.date.getHours()).toBe(12);
  expect(goal.successCriteria).toBe('Проверяется открытием URL');
  expect(goal.completed).toBe(false);
});
it('M6b rejects empty first step or missing success criteria before any write', async () => {
  await expect(applyRecommendationDecision({
    ...params, action: 'goal', goalId: 'empty-step',
    goalTitle: 'Проверяемая цель', goalStep: ' '
  })).rejects.toThrow(/Проверьте/);
  await expect(applyRecommendationDecision({
    ...params, action: 'goal', goalId: 'empty-criterion',
    goalTitle: 'Проверяемая цель', goalCriteria: ''
  })).rejects.toThrow(/Проверьте/);
  expect(runTransaction).not.toHaveBeenCalled();
  expect(writes).toHaveLength(0);
});

it('refuses impossible deadlines without writing either session or goal', async () => {
  await expect(applyRecommendationDecision({
    ...params, action: 'goal', goalId: 'invalid-date',
    goalTitle: 'Сделать', goalDueDay: '2026-02-30'
  })).rejects.toThrow(/Проверьте/);
  expect(writes).toHaveLength(0);
});


it('M5c v2 still requires an owner decision and never auto-creates a goal',async()=>{
  session.chatHistory[1].interaction.version='reflect.interaction.v2';
  const result=await applyRecommendationDecision({...params,action:'saved'});
  expect(result.promptVersion).toBe('reflect.interaction.v2');
  expect(goal).toBeNull();
  expect(writes).toHaveLength(1);
  await applyRecommendationDecision({...params,action:'saved'});
  expect(writes).toHaveLength(1);
});

describe('M6a owner choice remains available but ungrounded goals are rejected inside transaction', () => {
  const goalInput = {
    ...params, action: 'goal', goalId: 'synthetic-goal',
    goalTitle: 'Подтверждённая проверяемая цель',
    goalStep: 'Запустить минимальный тест',
    goalCriteria: 'Воспроизводимый результат теста'
  };
  it('rejects goal on unknowns; user can save idea without creating goal', async () => {
    session.chatHistory[1].interaction.unknowns = ['Неизвестный риск'];
    await expect(applyRecommendationDecision(goalInput))
      .rejects.toThrow(/неизвестные обстоятельства/);
    expect(writes).toHaveLength(0);
    const saved = await applyRecommendationDecision({
      ...params, action: 'saved'
    });
    expect(saved.status).toBe('saved');
    expect(goal).toBeNull();
  });
  it('denies a goal while questions or hypotheses are still open', async () => {
    const interaction = session.chatHistory[1].interaction;
    interaction.stage = 'clarify';
    interaction.clarifyingQuestion = 'Чего не хватает?';
    await expect(applyRecommendationDecision(goalInput))
      .rejects.toThrow(/открытый уточняющий/);
    interaction.stage = 'synthesize';
    interaction.clarifyingQuestion = '';
    interaction.insights = ['Возможно, это ключевой мотив'];
    await expect(applyRecommendationDecision(goalInput))
      .rejects.toThrow(/оцените все гипотезы/);
    expect(writes).toHaveLength(0);
  });
  it('verifies actual stored review coordinates and owner grade before creating goal', async () => {
    const interaction = session.chatHistory[1].interaction;
    interaction.insights = ['Это возможная причина'];
    const key = `h-${assistantMessage.id}-0`;
    session.hypothesisReviews = {
      [key]: { assistantMessageId: assistantMessage.id,
        hypothesisIndex: 0, grade: 0, comment: 'Это не соответствует фактам' }
    };
    await expect(applyRecommendationDecision(goalInput))
      .rejects.toThrow(/не подтвердили/);
    expect(writes).toHaveLength(0);
    session.hypothesisReviews[key].grade = 3;
    const accepted = await applyRecommendationDecision(goalInput);
    expect(accepted.status).toBe('accepted');
    expect(accepted.goalId).toBe('synthetic-goal');
    expect(writes.map(w => w.kind)).toEqual(['set','update']);
    await applyRecommendationDecision({ ...goalInput, goalId: 'other-goal' });
    expect(writes).toHaveLength(2);
  });
  it('blocks v2 goal if owner disputed a category, but not v2 idea-saving', async () => {
    const interaction = session.chatHistory[1].interaction;
    interaction.version = 'reflect.interaction.v2';
    interaction.evidenceSummary = {
      completeCount: 2, confirmedSlots: ['situation','desiredResult'],
      missingSlots: ['constraints'], disputedSlots: ['circumstances']
    };
    await expect(applyRecommendationDecision(goalInput))
      .rejects.toThrow(/не подтвердили/);
    expect(writes).toHaveLength(0);
    const saved = await applyRecommendationDecision({
      ...params, action: 'postponed'
    });
    expect(saved.status).toBe('postponed');
    expect(goal).toBeNull();
  });
});
