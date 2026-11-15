import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  doc, runTransaction, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { createGoal, removeGoal, updateGoal } from './goalOperations';

vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  doc: vi.fn((...parts) => ({
    id: parts[2] || 'generated-document-id',
    path: parts.slice(1).filter(x => typeof x === 'string').join('/')
  })),
  deleteField: vi.fn(() => ({ __delete: true })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  Timestamp: { fromDate: vi.fn(date => ({ date })) }
}));

let record;
let wasCreated;
let patches;
let sessionRecord;
let sessionExists;
beforeEach(() => {
  vi.clearAllMocks();
  record = {};
  wasCreated = false;
  patches = [];
  sessionRecord = {};
  sessionExists = false;
  runTransaction.mockImplementation(async (_db, callback) => {
    const transaction = {
      get: vi.fn(async ref => {
        const isSession = ref.path.includes('/sessions/');
        return {
          exists: () => isSession ? sessionExists : wasCreated,
          data: () => structuredClone(isSession ? sessionRecord : record)
        };
      }),
      set: vi.fn((_ref, payload) => {
        record = { ...payload };
        wasCreated = true;
        patches.push(payload);
      }),
      update: vi.fn((ref, payload) => {
        patches.push(payload);
        if (ref.path.includes('/sessions/')) {
          sessionRecord = { ...sessionRecord, ...payload };
        } else {
          record = { ...record, ...payload };
        }
      }),
      delete: vi.fn(ref => {
        wasCreated = false;
        patches.push({ deleted: ref.path });
      })
    };
    return callback(transaction);
  });
});

describe('transactional goal persistence', () => {
  it('creates a no-deadline checklist with a stable document ID', async () => {
    await createGoal('synthetic-uid', 'fixed-goal-id', {
      text: '  Цель без срока  ', purpose: '', type: 'checklist',
      dueDay: '', subItems: [{ id: 'step1', text: 'Действие' }]
    });
    expect(doc).toHaveBeenCalledWith(expect.anything(),
      'artifacts/reflect-8fdc8/users/synthetic-uid/goals', 'fixed-goal-id');
    expect(record.text).toBe('Цель без срока');
    expect(record.status).toBe('active');
    expect(record.completed).toBe(false);
    expect(record).not.toHaveProperty('dueDate');
    expect(record.subItems).toEqual([{ id: 'step1', text: 'Действие', completed: false }]);
  });

  it('does not duplicate or overwrite an already committed goal on ambiguous retry', async () => {
    const draft = { text: 'Цель', purpose: '', type: 'checklist', dueDay: '' };
    await createGoal('synthetic-uid', 'same-id', draft);
    const saved = { ...record, status: 'completed', completed: true };
    record = saved;
    await createGoal('synthetic-uid', 'same-id', draft);
    expect(patches).toHaveLength(1);
    expect(record.completed).toBe(true);
  });

  it('requires a syntactically valid optional date without UTC midnight parsing', async () => {
    await createGoal('synthetic-uid', 'date-id', {
      text: 'Дело', type: 'reflection', dueDay: '2026-11-06'
    });
    expect(record.dueDay).toBe('2026-11-06');
    expect(Timestamp.fromDate).toHaveBeenCalledWith(expect.any(Date));
    const date = Timestamp.fromDate.mock.calls[0][0];
    expect(date.getHours()).toBe(12);
  });

  it('changes status explicitly without silently completing subtasks', async () => {
    wasCreated = true;
    record = { text: 'Дело', subItems: [{ id: 'a', completed: false }] };
    await updateGoal('synthetic-uid', 'g', { kind: 'status', status: 'completed' });
    expect(record.completed).toBe(true);
    expect(record.status).toBe('completed');
    expect(record.subItems[0].completed).toBe(false);
    expect(serverTimestamp).toHaveBeenCalled();
  });

  it('updates task completion from current transaction snapshot without mutation', async () => {
    const oldItem = Object.freeze({ id: 'a', text: 'Шаг', completed: false });
    wasCreated = true;
    record = { subItems: [oldItem], completed: false };
    await updateGoal('synthetic-uid', 'g', {
      kind: 'toggleSubtask', target: { id: 'a' }, completed: true
    });
    expect(record.subItems[0].completed).toBe(true);
    expect(oldItem.completed).toBe(false);
    expect(record.completed).toBe(false);
  });

  it('idempotently adds a subtask keyed by its ID', async () => {
    wasCreated = true;
    record = { subItems: [] };
    const action = { kind: 'addSubtask', id: 'same-step', text: 'Новый шаг' };
    await updateGoal('synthetic-uid', 'g', action);
    await updateGoal('synthetic-uid', 'g', action);
    expect(record.subItems).toHaveLength(1);
    expect(patches).toHaveLength(1);
  });

  it('refuses stale edits instead of overwriting another legacy subtask', async () => {
    wasCreated = true;
    record = { subItems: [{ text: 'Changed elsewhere' }] };
    await expect(updateGoal('synthetic-uid', 'g', {
      kind: 'editSubtask', target: { index: 0, text: 'Old' }, text: 'New'
    })).rejects.toThrow('Подзадача изменилась');
    expect(patches).toHaveLength(0);
  });

  it('clears a due date on explicit edit and leaves linked sessionId untouched', async () => {
    wasCreated = true;
    record = { sessionId: 'parent-session', dueDay: '2026-11-06' };
    await updateGoal('synthetic-uid', 'g', {
      kind: 'edit', text: 'Цель', purpose: '', dueDay: ''
    });
    expect(record.sessionId).toBe('parent-session');
    expect(record.dueDay).toEqual({ __delete: true });
  });


  it('rejects stale concurrent goal text edits rather than losing the newer write', async () => {
    wasCreated = true;
    record = { text: 'Edited elsewhere', purpose: 'Original', dueDay: '2026-11-06' };
    await expect(updateGoal('synthetic-uid', 'g', {
      kind: 'edit', text: 'Local change', purpose: 'Original', dueDay: '2026-11-06',
      expected: { text: 'Original', purpose: 'Original', dueDay: '2026-11-06' }
    })).rejects.toThrow('Цель изменилась в другой вкладке');
    expect(record.text).toBe('Edited elsewhere');
    expect(patches).toHaveLength(0);
  });

  it('rejects updates when the goal was concurrently deleted', async () => {
    await expect(updateGoal('synthetic-uid', 'g', {
      kind: 'status', status: 'paused'
    })).rejects.toThrow('больше не существует');
    expect(patches).toHaveLength(0);
  });

  it('deletes an existing ordinary goal only in the signed-in owner namespace', async () => {
    wasCreated = true;
    record = { text: 'Обычная цель' };
    await removeGoal('synthetic-uid', 'owned-goal');
    expect(doc).toHaveBeenCalledWith(expect.anything(),
      'artifacts/reflect-8fdc8/users/synthetic-uid/goals', 'owned-goal');
    expect(patches).toEqual([{
      deleted: 'artifacts/reflect-8fdc8/users/synthetic-uid/goals/owned-goal'
    }]);
    expect(wasCreated).toBe(false);
  });

  it('atomically marks a matched accepted decision removed without changing the decision', async () => {
    wasCreated = true;
    sessionExists = true;
    record = {
      sourceType: 'user-accepted-ai-recommendation',
      sessionId: 'saved-session',
      sourceRecommendationKey: 'r-assistant-1-0',
      sourceAssistantMessageId: 'assistant-1'
    };
    sessionRecord = { recommendationDecisions: {
      'r-assistant-1-0': {
        status: 'accepted', goalId: 'owned-goal', assistantMessageId: 'assistant-1'
      },
      'r-other-0': { status: 'saved' }
    } };
    await removeGoal('synthetic-uid', 'owned-goal');
    expect(patches).toHaveLength(2);
    expect(sessionRecord.recommendationDecisions['r-assistant-1-0']).toEqual({
      status: 'accepted', goalId: 'owned-goal', assistantMessageId: 'assistant-1',
      goalRemovedAt: { __serverTimestamp: true }
    });
    expect(sessionRecord.recommendationDecisions['r-other-0']).toEqual({ status: 'saved' });
    expect(wasCreated).toBe(false);
    await removeGoal('synthetic-uid', 'owned-goal');
    expect(patches).toHaveLength(2); // Idempotent ambiguous delete retry.
  });

  it('does not modify a mismatched decision or missing session while deleting the goal', async () => {
    wasCreated = true;
    sessionExists = true;
    record = {
      sourceType: 'user-accepted-ai-recommendation',
      sessionId: 'saved-session',
      sourceRecommendationKey: 'r-assistant-1-0',
      sourceAssistantMessageId: 'assistant-1'
    };
    sessionRecord = { recommendationDecisions: {
      'r-assistant-1-0': { status: 'accepted', goalId: 'some-other-goal',
        assistantMessageId: 'assistant-1' }
    } };
    await removeGoal('synthetic-uid', 'owned-goal');
    expect(patches).toHaveLength(1);
    expect(sessionRecord.recommendationDecisions['r-assistant-1-0'])
      .not.toHaveProperty('goalRemovedAt');
    wasCreated = true;
    sessionExists = false;
    patches = [];
    await removeGoal('synthetic-uid', 'owned-goal');
    expect(patches).toHaveLength(1);
    expect(wasCreated).toBe(false);
  });

  it('rejects missing ID and never writes for a goal already removed', async () => {
    await expect(removeGoal('synthetic-uid', '')).rejects.toThrow('Идентификатор');
    await removeGoal('synthetic-uid', 'already-gone');
    expect(patches).toHaveLength(0);
  });
});
