import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectTopicMemoryCheckpoint } from './topicMemoryAuditService.r102c.js';
import { topicMemoryCheckpointEnabled } from './topicMemoryCheckpoint.js';
import { getDoc, getDocs } from 'firebase/firestore';

vi.mock('./topicMemoryCheckpoint.js', () => ({
  topicMemoryCheckpointEnabled: vi.fn(() => true)
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_database, ...parts) => ({ path: parts.join('/') })),
  collection: vi.fn((_database, ...parts) => ({ path: parts.join('/') })),
  query: vi.fn((ref, ...clauses) => ({ ref, clauses })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  orderBy: vi.fn((field, direction) => ({ field, direction })),
  limit: vi.fn(n => ({ take: n })),
  getDoc: vi.fn(), getDocs: vi.fn()
}));
const uid = 'owner-Q', sid = 'session-Q';
const base = `artifacts/reflect-8fdc8/users/${uid}`;
const ref = type => `${base}/${type}/${sid}`;
const event = {
  schemaVersion: 1, eventId: 'ev-1', ownerId: uid, topicId: sid,
  sessionId: sid, sequence: 1, kind: 'owner.topic.return', origin: 'owner',
  verification: 'owner-observed', text: 'Возвращение',
  source: { collection: 'sessions', documentId: sid, recordId: 'visit-1' },
  payload: { note: 'Проверил результат' }, topicScope: 'session-provisional'
};
const head = { ownerId: uid, topicId: sid, scopeMode: 'session-provisional',
  lastSequence: 1, lastEventId: 'ev-1',
  updatedAt: { firestoreTimestamp: true } };
const saved = { chatHistory: [], returnCheckIns: [{ id: 'visit-1',
  author: 'user', type: 'return-check-in', memoryEventId: 'ev-1',
  text: 'Проверил результат' }] };
let store, topicReads, corruptAfterRead;
const snap = value => ({ exists: () => value !== undefined,
  data: () => value });
const start = () => inspectTopicMemoryCheckpoint({
  database: { app: { options: { projectId: 'demo-reflect-auth-qa' } } }, appId: 'reflect-8fdc8', ownerId: uid, topicId: sid
});
beforeEach(() => {
  vi.clearAllMocks();
  topicMemoryCheckpointEnabled.mockReturnValue(true);
  store = new Map([[ref('memoryTopics'), structuredClone(head)],
    [ref('sessions'), structuredClone(saved)]]);
  topicReads = 0; corruptAfterRead = null;
  getDoc.mockImplementation(async target => {
    if (target.path === ref('memoryTopics') && ++topicReads === 2 &&
        corruptAfterRead) corruptAfterRead(store);
    return snap(store.get(target.path));
  });
  getDocs.mockResolvedValue({ docs: [{ id: event.eventId,
    data: () => structuredClone(event) }] });
});
afterEach(() => vi.unstubAllEnvs());
describe('R10.2-C explicit demo-only read-only Firestore inspection', () => {
  it('reports checkpoint-missing with exact session evidence', async () => {
    const report = await start();
    expect(report).toMatchObject({ status: 'checkpoint-missing',
      sourceReferencesChecked: 1, independentServerAttestation: false,
      authorizedForProvider: false, writePerformed: false });
    expect(getDocs).toHaveBeenCalledOnce();
  });
  it('refuses any non-demo or incorrectly scoped invocation', async () => {
    topicMemoryCheckpointEnabled.mockReturnValue(false);
    await expect(start()).rejects.toThrow('memory-audit-disabled');
    expect(getDoc).not.toHaveBeenCalled();
    topicMemoryCheckpointEnabled.mockReturnValue(true);
    await expect(inspectTopicMemoryCheckpoint({ database: { app: { options: { projectId: 'demo-reflect-auth-qa' } } },
      appId: 'another', ownerId: uid, topicId: sid }))
      .rejects.toThrow('memory-audit-invalid-scope');
  });
  it('refuses a missing or oversized topic before loading any events', async () => {
    store.delete(ref('memoryTopics'));
    await expect(start()).rejects.toThrow('memory-audit-topic-missing');
    store.set(ref('memoryTopics'), { ...head, lastSequence: 251 });
    await expect(start()).rejects.toThrow('memory-audit-topic-too-large');
    expect(getDocs).not.toHaveBeenCalled();
  });
  it('rejects incomplete query and inconsistent document IDs', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] });
    await expect(start()).rejects.toThrow('memory-audit-incomplete-ledger');
    getDocs.mockResolvedValueOnce({ docs: [{ id: 'wrong',
      data: () => event }] });
    await expect(start()).rejects.toThrow('memory-audit-event-id-conflict');
  });
  it('stops if topic changes during audit rather than claiming a stable view', async () => {
    corruptAfterRead = map => map.set(ref('memoryTopics'),
      { ...head, lastSequence: 2, lastEventId: 'ev-2' });
    await expect(start()).rejects.toThrow('memory-audit-concurrent-write');
  });
  it('stops if the projection is replaced during the audit', async () => {
    corruptAfterRead = map => map.set(ref('memoryProjections'),
      { ownerId: uid, topicId: sid, asOfSequence: 1,
        asOfEventId: 'ev-1', checkpointVersion: 1,
        providerUseAllowed: false, clientComputed: true,
        projection: { arbitrary: 'change' } });
    await expect(start()).rejects.toThrow('memory-audit-concurrent-write');
  });
  it('accepts Firestore timestamp-like metadata without mistaking it for JSON proof', async () => {
    expect((await start()).ledgerHeadSequence).toBe(1);
  });
});
