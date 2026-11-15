import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runTransaction } from 'firebase/firestore';
import { saveSessionReturn } from './sessionReturn';

vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, root, id) => ({ path: `${root}/${id}` })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ serverTime: true })),
  Timestamp: { now: vi.fn(() => ({ seconds: 1790000000 })) }
}));
const input = {
  userId: 'synthetic-owner', sessionId: 'saved-session',
  visitId: 'stable-visit', note: '  Я сделал два шага и один день пропустил  '
};
let session, goal, writes;
beforeEach(() => {
  vi.clearAllMocks();
  session = { title: 'Мой сеанс', chatHistory: [{ role: 'user', content: 'Привет' }] };
  goal = null;
  writes = [];
  runTransaction.mockImplementation(async (_db, callback) => callback({
    get: vi.fn(async ref => {
      const current = ref.path.includes('/goals/') ? goal : session;
      return { exists: () => current !== null, data: () => current };
    }),
    update: vi.fn((ref, patch) => {
      writes.push({ path: ref.path, patch });
      session = { ...session, ...patch };
    })
  }));
});
describe('PRODUCT-03 confirmed return visits', () => {
  it('writes an authored return once, without changing the transcript or AI provider', async () => {
    const result = await saveSessionReturn(input);
    expect(result.text).toBe('Я сделал два шага и один день пропустил');
    expect(result.author).toBe('user');
    expect(result.type).toBe('return-check-in');
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe('artifacts/reflect-8fdc8/users/synthetic-owner/sessions/saved-session');
    expect(session.chatHistory).toEqual([{ role: 'user', content: 'Привет' }]);
    expect(session.returnCheckIns).toHaveLength(1);
    await saveSessionReturn(input);
    expect(writes).toHaveLength(1);
  });
  it('retains older check-ins and rejects a nonexisting session', async () => {
    session.returnCheckIns = [{ id: 'older', type: 'return-check-in', author: 'user', text: 'Было' }];
    await saveSessionReturn(input);
    expect(session.returnCheckIns.map(x => x.id)).toEqual(['older', 'stable-visit']);
    session = null;
    await expect(saveSessionReturn(input)).rejects.toThrow(/больше не существует/);
  });
  it('guards UID paths, control characters, empty and overlong notes', async () => {
    await expect(saveSessionReturn({ ...input, userId: '../another' })).rejects.toThrow();
    await expect(saveSessionReturn({ ...input, sessionId: '../another' })).rejects.toThrow();
    await expect(saveSessionReturn({ ...input, note: '  ' })).rejects.toThrow();
    await expect(saveSessionReturn({ ...input, note: 'a'.repeat(1201) })).rejects.toThrow();
    await expect(saveSessionReturn({ ...input, note: 'danger\u0000' })).rejects.toThrow();
    expect(writes).toHaveLength(0);
  });
  it('M7a: links observed outcome and next owner step to an accepted goal in one session write', async () => {
    goal = {
      sessionId: 'saved-session', sourceType: 'user-accepted-ai-recommendation',
      sourceRecommendationKey: 'r-assistant-0',
      sourceAssistantMessageId: 'assistant'
    };
    session.recommendationDecisions = {
      'r-assistant-0': {
        status: 'accepted', goalId: 'goal1', assistantMessageId: 'assistant'
      }
    };
    const result = await saveSessionReturn({
      ...input, goalId: 'goal1', nextStep: '  Проверить прототип лично  '
    });
    expect(result).toMatchObject({
      goalId: 'goal1', author: 'user', type: 'return-check-in',
      nextStep: 'Проверить прототип лично'
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toContain('/sessions/saved-session');
    expect(session.returnCheckIns).toHaveLength(1);
    expect(goal).not.toHaveProperty('status');
    expect(goal).not.toHaveProperty('completed');
    expect(session.chatHistory).toHaveLength(1);
    await saveSessionReturn({
      ...input, goalId: 'goal1', nextStep: 'Проверить прототип лично'
    });
    expect(writes).toHaveLength(1);
  });

  it('M7a: blocks unverified cross-session, missing and deleted goals without writing', async () => {
    const linked = { ...input, goalId: 'goal1', nextStep: 'Повторить тест' };
    await expect(saveSessionReturn(linked)).rejects.toThrow('больше не существует');
    goal = {
      sessionId: 'another-session', sourceType: 'user-accepted-ai-recommendation',
      sourceRecommendationKey: 'r-assistant-0',
      sourceAssistantMessageId: 'assistant'
    };
    session.recommendationDecisions = {
      'r-assistant-0': { status: 'accepted', goalId: 'goal1',
        assistantMessageId: 'assistant' }
    };
    await expect(saveSessionReturn(linked)).rejects.toThrow('не подтверждена');
    goal.sessionId = 'saved-session';
    session.recommendationDecisions['r-assistant-0'].goalRemovedAt = { seconds: 1 };
    await expect(saveSessionReturn(linked)).rejects.toThrow('не подтверждена');
    expect(writes).toHaveLength(0);
  });

  it('M7a: requires a voluntary next step only when linking a goal; rejects invalid values', async () => {
    await expect(saveSessionReturn({ ...input, goalId: 'goal1', nextStep: '' }))
      .rejects.toThrow('следующий шаг');
    await expect(saveSessionReturn({ ...input, goalId: '../foreign',
      nextStep: 'Выполнить' })).rejects.toThrow();
    await expect(saveSessionReturn({ ...input, nextStep: 'z'.repeat(241) })).rejects.toThrow();
    await expect(saveSessionReturn({ ...input, nextStep: 'X' + String.fromCharCode(0) })).rejects.toThrow();
    const standalone = await saveSessionReturn({
      ...input, nextStep: '  Продолжить тему завтра  '
    });
    expect(standalone.nextStep).toBe('Продолжить тему завтра');
    expect(standalone).not.toHaveProperty('goalId');
  });

  it('caps embedded returns so Firestore session documents cannot grow without bound', async () => {
    session.returnCheckIns = Array.from({ length: 80 }, (_, i) => ({ id: 'v-' + i }));
    await expect(saveSessionReturn(input)).rejects.toThrow(/лимит/);
    expect(writes).toHaveLength(0);
  });
});
