import { beforeEach, expect, test, vi } from 'vitest';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { saveGoalCompletionFeedback } from './goalOperations';

vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), deleteField: vi.fn(), Timestamp: { fromDate: vi.fn() },
  doc: vi.fn((_db, ...parts) => ({ path: parts.join('/') })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true }))
}));
let goal, writes;
beforeEach(() => {
  vi.clearAllMocks();
  goal = { text: 'Тестовая цель', status: 'completed', completed: true };
  writes = [];
  runTransaction.mockImplementation((_db, callback) => callback({
    get: async () => ({ exists: () => Boolean(goal), data: () => structuredClone(goal) }),
    update: (_ref, patch) => { writes.push(patch); goal = { ...goal, ...patch }; }
  }));
});

test('R9.2.3 saves feedback only in the owner completed goal', async () => {
  await saveGoalCompletionFeedback('owner-a', 'goal-1', {
    rating: 4, comment: 'Результат достигнут'
  });
  expect(doc).toHaveBeenCalledWith(expect.anything(),
    'artifacts/reflect-8fdc8/users/owner-a/goals', 'goal-1');
  expect(writes).toHaveLength(1);
  expect(goal.checklistFeedback).toMatchObject({ rating: 4, comment: 'Результат достигнут' });
  expect(serverTimestamp).toHaveBeenCalled();
});

test('R9.2.3 retains createdAt when user edits existing feedback', async () => {
  const createdAt = { seconds: 42 };
  goal.checklistFeedback = { rating: 3, comment: 'Первая версия', createdAt };
  await saveGoalCompletionFeedback('owner-a', 'goal-1', {
    rating: 5, comment: 'Пересмотр результата'
  }, { rating: 3, comment: 'Первая версия' });
  expect(writes).toHaveLength(1);
  expect(goal.checklistFeedback.createdAt).toEqual(createdAt);
  expect(goal.checklistFeedback.updatedAt).toEqual({ __serverTimestamp: true });
});

test('R9.2.3 does not overwrite a result edited in another tab', async () => {
  goal.checklistFeedback = { rating: 2, comment: 'Новая версия' };
  await expect(saveGoalCompletionFeedback('owner-a', 'goal-1', {
    rating: 5, comment: 'Старый черновик'
  }, { rating: 1, comment: 'Старая версия' }))
    .rejects.toThrow('Итог изменён в другой вкладке');
  expect(writes).toHaveLength(0);
});

test('R9.2.3 refuses not-completed and missing goals, and invalid input', async () => {
  goal.status = 'active'; goal.completed = false;
  await expect(saveGoalCompletionFeedback('owner-a', 'goal-1',
    { rating: 4, comment: 'Тест' })).rejects.toThrow('завершённой цели');
  goal = null;
  await expect(saveGoalCompletionFeedback('owner-a', 'goal-1',
    { rating: 4, comment: 'Тест' })).rejects.toThrow('больше не существует');
  await expect(saveGoalCompletionFeedback('owner-a', 'goal-1',
    { rating: 9, comment: 'Тест' })).rejects.toThrow('Проверь оценку');
  expect(writes).toHaveLength(0);
});
