import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteField, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import {
  setOwnerDocumentArchived, setOwnerRecommendationArchived
} from './archiveOperations';

vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...parts) => ({ path: parts.join('/') })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  deleteField: vi.fn(() => ({ __deleted: true }))
}));
vi.mock('../Sessions/recommendationDecisions', () => ({
  recommendationKey: vi.fn((messageId, index) => `r-${messageId}-${index}`)
}));
vi.mock('../Sessions/interactionVersions', () => ({
  isSupportedInteraction: vi.fn(value => Boolean(value &&
    Array.isArray(value.recommendationCandidates)))
}));

const ownerPath = (kind, id) =>
  `artifacts/reflect-8fdc8/users/owner-one/${kind}/${id}`;
const source = {
  chatHistory: [
    { id: 'user-one', role: 'user', content: 'Сохранённый текст' },
    { id: 'assistant-one', role: 'assistant', interaction: {
      version: 'reflect.interaction.v1', recommendationCandidates: [
        { title: 'Действие', rationale: 'Основание', sourceRefs: ['current-message'] }
      ] }
    }
  ],
  recommendationDecisions: {}
};
let records, writes;
const clone = value => structuredClone(value);

beforeEach(() => {
  vi.clearAllMocks();
  records = new Map();
  writes = [];
  runTransaction.mockImplementation(async (_db, fn) => fn({
    get: async ref => ({
      exists: () => records.has(ref.path),
      data: () => clone(records.get(ref.path))
    }),
    update: (ref, fields) => {
      writes.push({ path: ref.path, fields: clone(fields) });
      const item = clone(records.get(ref.path));
      for (const [key, value] of Object.entries(fields)) {
        if (value?.__deleted) delete item[key];
        else item[key] = clone(value);
      }
      records.set(ref.path, item);
    }
  }));
});

describe('R9.2.4 safe owner archival', () => {
  it('archives and restores a session without touching transcript or links', async () => {
    const path = ownerPath('sessions', 'session-one');
    records.set(path, { ...clone(source), mindLinks: [{ id: 'link-1' }] });
    expect(await setOwnerDocumentArchived({ userId: 'owner-one', kind: 'sessions',
      recordId: 'session-one', archived: true })).toEqual({ archived: true, changed: true });
    expect(records.get(path).chatHistory).toEqual(source.chatHistory);
    expect(records.get(path).mindLinks).toEqual([{ id: 'link-1' }]);
    expect(writes).toHaveLength(1);
    expect(await setOwnerDocumentArchived({ userId: 'owner-one', kind: 'sessions',
      recordId: 'session-one', archived: true })).toEqual({ archived: true, changed: false });
    expect(writes).toHaveLength(1);
    await setOwnerDocumentArchived({ userId: 'owner-one', kind: 'sessions',
      recordId: 'session-one', archived: false });
    expect(records.get(path)).not.toHaveProperty('archivedAt');
    expect(records.get(path).chatHistory).toEqual(source.chatHistory);
    expect(writes).toHaveLength(2);
  });

  it('archives a goal without changing completion status or feedback', async () => {
    const path = ownerPath('goals', 'goal-one');
    const goal = { status: 'completed', completed: true,
      checklistFeedback: { rating: 5, comment: 'Сохранённый итог' },
      sessionId: 'session-one', subItems: [{ id: 'sub-1', completed: true }] };
    records.set(path, clone(goal));
    await setOwnerDocumentArchived({ userId: 'owner-one', kind: 'goals',
      recordId: 'goal-one', archived: true });
    expect(records.get(path)).toMatchObject(goal);
    expect(records.get(path)).toHaveProperty('archivedAt');
    expect(doc).toHaveBeenCalledWith(expect.anything(),
      'artifacts/reflect-8fdc8/users/owner-one', 'goals', 'goal-one');
  });

  it('rejects unsafe or foreign paths before Firestore', async () => {
    await expect(setOwnerDocumentArchived({ userId: 'owner-one', kind: 'another',
      recordId: 'goal-one', archived: true })).rejects.toThrow('Некорректные');
    await expect(setOwnerDocumentArchived({ userId: 'owner/other', kind: 'goals',
      recordId: 'goal-one', archived: true })).rejects.toThrow('Некорректные');
    await expect(setOwnerDocumentArchived({ userId: 'owner-one', kind: 'sessions',
      recordId: 'session-one', archived: 'true' })).rejects.toThrow('Некорректные');
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('archives pending recommendation as metadata only, preserving history', async () => {
    const path = ownerPath('sessions', 'session-one');
    records.set(path, clone(source));
    const args = { userId: 'owner-one', sessionId: 'session-one',
      assistantMessageId: 'assistant-one', candidateIndex: 0, archived: true };
    await setOwnerRecommendationArchived(args);
    expect(records.get(path).recommendationDecisions['r-assistant-one-0'])
      .toEqual({ archivedAt: { __serverTimestamp: true } });
    expect(records.get(path).chatHistory).toEqual(source.chatHistory);
    expect(writes).toHaveLength(1);
    expect(await setOwnerRecommendationArchived(args))
      .toEqual({ archived: true, changed: false });
    expect(writes).toHaveLength(1);
    await setOwnerRecommendationArchived({ ...args, archived: false });
    expect(records.get(path).recommendationDecisions).toEqual({});
    expect(writes).toHaveLength(2);
  });

  it('retains accepted decision and goal ID through archive and restore', async () => {
    const path = ownerPath('sessions', 'session-one');
    records.set(path, { ...clone(source), recommendationDecisions: {
      'r-assistant-one-0': { status: 'accepted', goalId: 'goal-one',
        sourceMessageId: 'user-one', assistantMessageId: 'assistant-one' }
    } });
    const args = { userId: 'owner-one', sessionId: 'session-one',
      assistantMessageId: 'assistant-one', candidateIndex: 0 };
    await setOwnerRecommendationArchived({ ...args, archived: true });
    expect(records.get(path).recommendationDecisions['r-assistant-one-0'])
      .toMatchObject({ status: 'accepted', goalId: 'goal-one' });
    await setOwnerRecommendationArchived({ ...args, archived: false });
    expect(records.get(path).recommendationDecisions['r-assistant-one-0'])
      .toEqual({ status: 'accepted', goalId: 'goal-one',
        sourceMessageId: 'user-one', assistantMessageId: 'assistant-one' });
  });

  it('rejects absent/forged recommendation without writing', async () => {
    const path = ownerPath('sessions', 'session-one');
    records.set(path, { ...clone(source), chatHistory: [
      { id: 'assistant-one', role: 'assistant', interaction: source.chatHistory[1].interaction }
    ] });
    await expect(setOwnerRecommendationArchived({
      userId: 'owner-one', sessionId: 'session-one', assistantMessageId: 'assistant-one',
      candidateIndex: 0, archived: true
    })).rejects.toThrow('не подтверждена');
    expect(writes).toHaveLength(0);
  });

  it('rejects missing source documents without creating new ones', async () => {
    await expect(setOwnerDocumentArchived({ userId: 'owner-one', kind: 'goals',
      recordId: 'missing', archived: true })).rejects.toThrow('не существует');
    await expect(setOwnerRecommendationArchived({ userId: 'owner-one',
      sessionId: 'missing', assistantMessageId: 'assistant-one',
      candidateIndex: 0, archived: true })).rejects.toThrow('не существует');
    expect(writes).toHaveLength(0);
  });
});


it('R9.2.4C cannot change recommendation archive inside an archived session', async () => {
  const path=ownerPath('sessions','session-one');
  records.set(path,{...clone(source),archivedAt:{seconds:42}});
  await expect(setOwnerRecommendationArchived({userId:'owner-one',
    sessionId:'session-one',assistantMessageId:'assistant-one',
    candidateIndex:0,archived:true})).rejects.toThrow(/Сначала восстановите/);
  expect(writes).toEqual([]);
});
