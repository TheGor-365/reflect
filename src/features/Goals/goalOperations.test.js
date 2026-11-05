import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteDoc, doc, runTransaction, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { createGoal, removeGoal, updateGoal } from './goalOperations';

vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  doc: vi.fn((...parts) => ({
    id: parts[2] || 'generated-document-id',
    path: parts.slice(1).filter(x => typeof x === 'string').join('/')
  })),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => ({ __delete: true })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  Timestamp: { fromDate: vi.fn(date => ({ date })) }
}));

let record;
let wasCreated;
let patches;
beforeEach(() => {
  vi.clearAllMocks();
  record = {};
  wasCreated = false;
  patches = [];
  runTransaction.mockImplementation(async (_db, callback) => {
    const transaction = {
      get: vi.fn(async () => ({
        exists: () => wasCreated,
        data: () => structuredClone(record)
      })),
      set: vi.fn((_ref, payload) => {
        record = { ...payload };
        wasCreated = true;
        patches.push(payload);
      }),
      update: vi.fn((_ref, payload) => {
        patches.push(payload);
        record = { ...record, ...payload };
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

  it('rejects updates when the goal was concurrently deleted', async () => {
    await expect(updateGoal('synthetic-uid', 'g', {
      kind: 'status', status: 'paused'
    })).rejects.toThrow('больше не существует');
    expect(patches).toHaveLength(0);
  });

  it('deletes only the explicitly specified owned goal document', async () => {
    await removeGoal('synthetic-uid', 'owned-goal');
    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(doc).toHaveBeenCalledWith(expect.anything(),
      'artifacts/reflect-8fdc8/users/synthetic-uid/goals', 'owned-goal');
  });
});
