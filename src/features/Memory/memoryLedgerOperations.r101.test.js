import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTransaction } from 'firebase/firestore';
import { saveHypothesisReview } from '../Sessions/hypothesisReviews';
import { applyRecommendationDecision } from '../Sessions/recommendationDecisions';
import { saveSessionReturn } from '../Sessions/sessionReturn';
import { memoryLedgerEnabled, memoryEvidenceSummary } from './memoryLedgerOperations';

vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...parts) => ({ path: parts.join('/') })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ serverTime: true })),
  Timestamp: {
    now: vi.fn(() => ({ seconds: 1790000000 })),
    fromDate: vi.fn(date => ({ date }))
  }
}));

const root = 'artifacts/reflect-8fdc8/users/owner-A';
const sessionPath = `${root}/sessions/session-A`;
const memoryTopics = `${root}/memoryTopics/`;
const memoryEvents = `${root}/memoryEvents/`;
const firstUser = { role: 'user', id: 'user-A', content: 'Я рассказал ситуацию' };
const assistant = { role: 'assistant', id: 'assistant-A', interaction: {
  version: 'reflect.interaction.v1',
  insights: ['Возможно, я устал', 'Возможно, на меня давят'],
  recommendationCandidates: [{
    title: 'Записать наблюдения', rationale: 'Разделить факты и оценки',
    sourceRefs: ['current-message']
  }]
} };
const review = {
  userId: 'owner-A', sessionId: 'session-A',
  assistantMessageId: 'assistant-A', hypothesisIndex: 0,
  grade: 0, comment: 'Нет, дело не в усталости'
};
const decision = {
  userId: 'owner-A', sessionId: 'session-A',
  assistantMessageId: 'assistant-A', candidateIndex: 0, action: 'saved'
};
const visit = {
  userId: 'owner-A', sessionId: 'session-A', visitId: 'visit-1',
  note: 'Вернулся к этой теме спустя неделю'
};
let store, writes, failOnEvent;
const clone = data => structuredClone(data);
const memoryDocs = () => [...store.entries()]
  .filter(([path]) => path.startsWith(memoryEvents))
  .map(([path, value]) => ({ path, ...value }))
  .sort((a, b) => a.sequence - b.sequence);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
  vi.stubEnv('VITE_ENABLE_REFLECT_MEMORY_LEDGER', 'true');
  failOnEvent = false;
  store = new Map([[sessionPath, {
    chatHistory: [clone(firstUser), clone(assistant)]
  }]]);
  writes = [];
  runTransaction.mockImplementation(async (_database, callback) => {
    const pending = [];
    const tx = {
      get: vi.fn(async ref => {
        const value = store.get(ref.path);
        return {
          exists: () => value !== undefined,
          data: () => clone(value)
        };
      }),
      set: vi.fn((ref, value) => {
        if (failOnEvent && ref.path.startsWith(memoryEvents)) {
          throw new Error('synthetic-ledger-write-failure');
        }
        pending.push({ op: 'set', path: ref.path, value: clone(value) });
      }),
      update: vi.fn((ref, value) => {
        pending.push({ op: 'update', path: ref.path, value: clone(value) });
      })
    };
    const result = await callback(tx);
    // Mimic the important atomic property: no writes if any read/step failed.
    for (const { op, path, value } of pending) {
      const previous = op === 'update' ? store.get(path) : null;
      if (op === 'update' && !previous) throw new Error('missing-target');
      store.set(path, op === 'set' ? value : { ...previous, ...value });
      writes.push({ op, path, value });
    }
    return result;
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('R10.1 isolated, owner-scoped, append-only memory ledger', () => {
  it('is disabled for hosted builds even with the R10 feature flag', () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'false');
    expect(memoryLedgerEnabled()).toBe(false);
  });
  it('records first review once and a revised review as a sourced correction', async () => {
    const first = await saveHypothesisReview(review);
    expect(first.memoryEventId).toMatch(/^ev-/);
    expect(memoryDocs()).toHaveLength(1);
    expect(memoryDocs()[0]).toMatchObject({
      kind: 'owner.hypothesis.review', sequence: 1,
      source: { collection: 'sessions', documentId: 'session-A',
        recordId: 'h-assistant-A-0' },
      topicId: 'session-A', topicScope: 'session-provisional',
      payload: { grade: 0, comment: review.comment }
    });
    const before = clone(memoryDocs()[0]);
    await saveHypothesisReview(review);
    expect(memoryDocs()).toHaveLength(1);
    await saveHypothesisReview({ ...review, grade: 3,
      comment: 'Теперь уточню: дело в публичном формате' });
    expect(memoryDocs()).toHaveLength(2);
    expect(memoryDocs()[0]).toEqual(before);
    expect(memoryDocs()[1]).toMatchObject({
      kind: 'owner.correction', sequence: 2,
      supersedes: first.memoryEventId, payload: { grade: 3 }
    });
    expect(store.get(`${memoryTopics}session-A`).lastSequence).toBe(2);
  });
  it('retains exact original comment in immutable payload if summary was shortened', async () => {
    const comment = '界'.repeat(500);
    await saveHypothesisReview({ ...review, comment });
    expect(memoryDocs()[0].text.endsWith('…')).toBe(true);
    expect(memoryDocs()[0].payload.comment).toBe(comment);
    expect(new TextEncoder().encode(memoryDocs()[0].text).length).toBeLessThanOrEqual(1500);
  });
  it('records changed recommendation decisions; same-value retry never appends', async () => {
    await applyRecommendationDecision(decision);
    await applyRecommendationDecision(decision);
    expect(memoryDocs()).toHaveLength(1);
    await applyRecommendationDecision({ ...decision, action: 'postponed' });
    await applyRecommendationDecision({ ...decision, action: 'dismissed' });
    expect(memoryDocs().map(x => x.payload.status)).toEqual([
      'saved', 'postponed', 'dismissed'
    ]);
    expect(memoryDocs().map(x => x.sequence)).toEqual([1, 2, 3]);
    expect(store.get(sessionPath).recommendationDecisions['r-assistant-A-0'])
      .toMatchObject({ status: 'dismissed', memoryEventId: memoryDocs()[2].eventId });
  });
  it('records only explicit return, not an ordinary revisit or duplicate visitId', async () => {
    await saveSessionReturn(visit);
    await saveSessionReturn(visit);
    expect(memoryDocs().map(x => x.kind)).toEqual(['owner.topic.return']);
    expect(memoryDocs()[0].payload.note).toBe(visit.note);
    expect(store.get(sessionPath).returnCheckIns).toHaveLength(1);
  });
  it('shares one monotonically ordered topic sequence for review, decision and return', async () => {
    await saveHypothesisReview(review);
    await applyRecommendationDecision(decision);
    await saveSessionReturn(visit);
    expect(memoryDocs().map(x => x.sequence)).toEqual([1, 2, 3]);
    expect(memoryDocs().map(x => x.kind)).toEqual([
      'owner.hypothesis.review', 'owner.recommendation.decision', 'owner.topic.return'
    ]);
  });
  it('does not change the source document if ledger persistence fails', async () => {
    const sourceBefore = clone(store.get(sessionPath));
    failOnEvent = true;
    await expect(saveHypothesisReview(review))
      .rejects.toThrow('synthetic-ledger-write-failure');
    expect(store.get(sessionPath)).toEqual(sourceBefore);
    expect(store.has(`${memoryTopics}session-A`)).toBe(false);
    expect(memoryDocs()).toHaveLength(0);
  });
  it('refuses unverified or corrupt topic ownership rather than logging under another topic', async () => {
    store.get(sessionPath).topicId = '../unsafe';
    await expect(saveHypothesisReview(review))
      .rejects.toThrow('memory-invalid-topic-identity');
    expect(memoryDocs()).toHaveLength(0);
    store.get(sessionPath).topicId = 'topic-A';
    await saveHypothesisReview(review);
    expect(memoryDocs()[0].topicId).toBe('topic-A');
    expect(memoryDocs()[0].topicScope).toBe('explicit');
  });
  it('refuses review mutations in an archived session even with an enabled ledger', async () => {
    store.get(sessionPath).archivedAt = { seconds: 42 };
    await expect(saveHypothesisReview(review)).rejects.toThrow(/архиве/);
    expect(memoryDocs()).toHaveLength(0);
  });
  it('normalizes CRLF only in the compact summary, retaining the source text', () => {
    expect(memoryEvidenceSummary('Первое\r\nВторое'))
      .toBe('Первое\nВторое');
  });
  it('trims summaries by UTF-8 bytes rather than slicing surrogate pairs', () => {
    const summary = memoryEvidenceSummary('😃'.repeat(800), 100);
    expect(summary.endsWith('…')).toBe(true);
    expect(new TextEncoder().encode(summary).length).toBeLessThanOrEqual(100);
  });
});
