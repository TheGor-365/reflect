import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceTopicMemoryCheckpoint,
  topicMemoryCheckpointEnabled } from './topicMemoryCheckpoint';
import { runTransaction, getDoc, getDocs } from 'firebase/firestore';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...parts) => ({ path: parts.join('/') })),
  collection: vi.fn((_db, ...parts) => ({ path: parts.join('/') })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  orderBy: vi.fn((field, direction) => ({ field, direction })),
  limit: vi.fn(n => ({ take: n })),
  query: vi.fn((ref, ...clauses) => ({ ref, clauses })),
  serverTimestamp: vi.fn(() => ({ server: true })),
  getDoc: vi.fn(), getDocs: vi.fn(), runTransaction: vi.fn()
}));

const ownerId = 'owner-A', topicId = 'session-A';
const root = `artifacts/reflect-8fdc8/users/${ownerId}`;
const topicPath = `${root}/memoryTopics/${topicId}`;
const cpPath = `${root}/memoryProjections/${topicId}`;
const evPath = id => `${root}/memoryEvents/${id}`;
const event = (sequence, note = `Возврат ${sequence}`) => ({
  schemaVersion: 1, eventId: `ev-${sequence}`, ownerId, topicId,
  sessionId: 'session-A', sequence, kind: 'owner.topic.return',
  origin: 'owner', verification: 'owner-observed',
  text: `Возвращение ${sequence}`, source: { collection: 'sessions',
    documentId: 'session-A', recordId: `visit-${sequence}` },
  payload: { note }, topicScope: 'session-provisional'
});
let store, allEvents, writes, failWrite, beforeCommit;
const clone = value => structuredClone(value);
const snap = value => ({ exists: () => value !== undefined,
  data: () => value === undefined ? undefined : clone(value) });
const args = () => ({ database: {}, appId: 'reflect-8fdc8', ownerId,
  topicId });
function putEvents(n) {
  store.set(topicPath, { ownerId, topicId, scopeMode: 'session-provisional',
    lastSequence: n, lastEventId: `ev-${n}` });
  allEvents = Array.from({ length: n }, (_, i) => event(i + 1));
  for (const e of allEvents) store.set(evPath(e.eventId), e);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
  vi.stubEnv('VITE_ENABLE_REFLECT_MEMORY_LEDGER', 'true');
  vi.stubEnv('VITE_ENABLE_REFLECT_MEMORY_CHECKPOINT', 'true');
  store = new Map(); allEvents = []; writes = [];
  failWrite = false; beforeCommit = null;
  getDoc.mockImplementation(async ref => snap(store.get(ref.path)));
  getDocs.mockImplementation(async q => {
    const threshold = q.clauses.find(x => x.field === 'sequence').value;
    const targetTopic = q.clauses.find(x => x.field === 'topicId').value;
    const count = q.clauses.find(x => x.take).take;
    return { docs: allEvents.filter(e => e.topicId === targetTopic &&
      e.sequence > threshold).slice(0, count).map(e => ({ id: e.eventId })) };
  });
  runTransaction.mockImplementation(async (_database, callback) => {
    const pending = [];
    const tx = {
      get: vi.fn(async ref => snap(store.get(ref.path))),
      set: vi.fn((ref, data) => pending.push({ path: ref.path, data: clone(data),
        action: 'set' })),
      update: vi.fn((ref, data) => pending.push({ path: ref.path, data: clone(data),
        action: 'update' }))
    };
    if (beforeCommit) beforeCommit();
    const result = await callback(tx);
    if (failWrite) throw new Error('simulated-transaction-abort');
    for (const p of pending) {
      store.set(p.path, p.action === 'update' ?
        { ...store.get(p.path), ...p.data } : p.data);
      writes.push(p);
    }
    return result;
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('R10.2-B read-only rebuildable Firestore memory checkpoint', () => {
  it('is disabled outside explicit demo emulator opt-in', async () => {
    expect(topicMemoryCheckpointEnabled()).toBe(true);
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'false');
    expect(topicMemoryCheckpointEnabled()).toBe(false);
    await expect(advanceTopicMemoryCheckpoint(args()))
      .rejects.toThrow('memory-checkpoint-disabled');
    expect(getDoc).not.toHaveBeenCalled();
  });
  it('refuses wrong app, owner, topic, or unbounded batch', async () => {
    await expect(advanceTopicMemoryCheckpoint({ ...args(),
      appId: 'other-app' })).rejects.toThrow('memory-checkpoint-invalid-scope');
    await expect(advanceTopicMemoryCheckpoint({ ...args(),
      batchSize: 200 })).rejects.toThrow('memory-checkpoint-invalid-scope');
  });
  it('requires the real memory topic counter', async () => {
    await expect(advanceTopicMemoryCheckpoint(args()))
      .rejects.toThrow('memory-checkpoint-missing-topic');
    expect(writes).toHaveLength(0);
  });
  it('creates first checkpoint from committed events, never as AI context', async () => {
    putEvents(2);
    const result = await advanceTopicMemoryCheckpoint(args());
    expect(result).toMatchObject({ asOfSequence: 2, wrote: true,
      remaining: 0, providerUseAllowed: false });
    const cp = store.get(cpPath);
    expect(cp).toMatchObject({ checkpointVersion: 1,
      asOfSequence: 2, asOfEventId: 'ev-2', clientComputed: true,
      providerUseAllowed: false, projection: {
        counts: { explicitReturns: 2, processed: 2 }
      } });
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(cpPath);
  });
  it('advances in bounded batches, without re-reading old events', async () => {
    putEvents(4);
    expect(await advanceTopicMemoryCheckpoint({ ...args(), batchSize: 2 }))
      .toMatchObject({ asOfSequence: 2, remaining: 2, hasMore: true });
    expect(await advanceTopicMemoryCheckpoint({ ...args(), batchSize: 2 }))
      .toMatchObject({ asOfSequence: 4, remaining: 0, hasMore: false });
    expect(store.get(cpPath).projection.counts.explicitReturns).toBe(4);
    expect(getDocs.mock.calls[1][0].clauses.find(x => x.field === 'sequence')
      .value).toBe(2);
    expect(writes.map(w => w.action)).toEqual(['set','update']);
  });
  it('does not write when already up to date', async () => {
    putEvents(1);
    await advanceTopicMemoryCheckpoint(args());
    const result = await advanceTopicMemoryCheckpoint(args());
    expect(result).toMatchObject({ asOfSequence: 1, wrote: false });
    expect(writes).toHaveLength(1);
  });
  it('rejects sequence gaps and does not store partial projection', async () => {
    putEvents(2);
    store.delete(evPath('ev-1'));
    allEvents = [allEvents[1]];
    await expect(advanceTopicMemoryCheckpoint(args()))
      .rejects.toThrow('memory-projection-noncontiguous-sequence');
    expect(writes).toHaveLength(0);
  });
  it('rejects events from a different user even within owner query', async () => {
    putEvents(1);
    store.set(evPath('ev-1'), { ...event(1), ownerId: 'owner-B' });
    await expect(advanceTopicMemoryCheckpoint(args()))
      .rejects.toThrow('memory-checkpoint-invalid-event');
  });
  it('rejects a forged previously persisted projection', async () => {
    putEvents(1);
    store.set(cpPath, { checkpointVersion: 1, ownerId, topicId,
      asOfSequence: 1, asOfEventId: 'ev-1', clientComputed: true,
      providerUseAllowed: true, projection: {} });
    await expect(advanceTopicMemoryCheckpoint(args()))
      .rejects.toThrow('memory-checkpoint-invalid');
  });
  it('detects a concurrent checkpoint update without overwriting it', async () => {
    putEvents(1);
    beforeCommit = () => store.set(cpPath, {
      checkpointVersion: 1, ownerId, topicId,
      asOfSequence: 2, asOfEventId: 'ev-2',
      clientComputed: true, providerUseAllowed: false,
      projection: { projectionVersion: 1 }
    });
    await expect(advanceTopicMemoryCheckpoint(args()))
      .rejects.toThrow();
    expect(writes).toHaveLength(0);
  });
  it('transaction failure leaves checkpoint absent for retry', async () => {
    putEvents(1); failWrite = true;
    await expect(advanceTopicMemoryCheckpoint(args()))
      .rejects.toThrow('simulated-transaction-abort');
    expect(store.has(cpPath)).toBe(false);
    failWrite = false;
    expect(await advanceTopicMemoryCheckpoint(args()))
      .toMatchObject({ wrote: true, asOfSequence: 1 });
  });
  it('rejects a query with no events when topic is ahead', async () => {
    putEvents(1); allEvents = [];
    await expect(advanceTopicMemoryCheckpoint(args()))
      .rejects.toThrow('memory-checkpoint-incomplete-query');
  });
});
