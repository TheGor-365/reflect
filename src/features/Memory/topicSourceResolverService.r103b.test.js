import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getDoc, doc } from 'firebase/firestore';
import { readTopicSourceCandidates, topicSourceReadEnabled }
  from './topicSourceResolverService.r103b.js';
import { topicMemoryCheckpointEnabled } from './topicMemoryCheckpoint.js';
import { inventoryTopicSources } from './topicSourceInventory.r103a.js';

vi.mock('./topicMemoryCheckpoint.js', () => ({
  topicMemoryCheckpointEnabled: vi.fn(() => true)
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...path) => ({ path: path.join('/'), id:path.at(-1) })),
  getDoc: vi.fn()
}));
const ownerId = 'ownerA', topicId = 'topicA';
const session = { id:'sA', topicId, chatHistory: [
  { id:'turn1', role:'user', content:'Мой текст' },
  { id:'turn2', role:'assistant', content:'Версия модели' }] };
const goal = { id:'goalA', topicId, text:'Моя цель', status:'active' };
const note = { id:'noteA', topicId, entries:[{text:'Дневниковая запись', version:1}] };
const database = { app:{ options:{ projectId:'demo-reflect-auth-qa' } } };
const auth = { currentUser:{ uid:ownerId } };
const inventory = () => inventoryTopicSources({ ownerId, topicId,
  sessions:[session], goals:[goal], diaryNotes:[note] });
const root = `artifacts/reflect-8fdc8/users/${ownerId}`;
const store = new Map();
const key = (collection,id) => `${root}/${collection}/${id}`;
const snap = (value, id) => ({ id, exists: () => value !== undefined,
  data: () => structuredClone(value) });
const read = (ids = ['sessions/sA/turn1'], extra = {}) =>
  readTopicSourceCandidates({ database, auth, appId:'reflect-8fdc8',
    ownerId, topicId, inventory:inventory(), candidateIds:ids, ...extra });

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('VITE_ENABLE_REFLECT_MEMORY_SOURCE_RESOLVER', 'true');
  topicMemoryCheckpointEnabled.mockReturnValue(true);
  auth.currentUser = { uid: ownerId };
  store.clear(); store.set(key('sessions','sA'), session);
  store.set(key('goals','goalA'), goal);
  store.set(key('diaryNotes','noteA'), note);
  getDoc.mockImplementation(async ref => snap(store.get(ref.path), ref.id));
});
afterEach(() => vi.unstubAllEnvs());

describe('R10.3-B demo-only Firebase readback (SDK mocked)', () => {
  it('reads one owner-scoped session twice even for two turns', async () => {
    const report = await read(['sessions/sA/turn1','sessions/sA/turn2']);
    expect(report).toMatchObject({ resolvedCount:2, documentsRead:1,
      readOperations:2, bestEffortReadbackStable:true,
      independentServerAttestation:false, providerUseAllowed:false });
    expect(doc).toHaveBeenCalledWith(database, 'artifacts', 'reflect-8fdc8',
      'users', ownerId, 'sessions', 'sA');
    expect(getDoc).toHaveBeenCalledTimes(2);
    expect(report.records[1].origin).toBe('model-proposed');
  });
  it('performs exact bounded reads for one goal and one diary entry', async () => {
    const report = await read(['goals/goalA/goalA','diaryNotes/noteA/entry-0']);
    expect(report.documentsRead).toBe(2);
    expect(report.readOperations).toBe(4);
    expect(report.records.map(r => r.source.collection)).toEqual(['goals','diaryNotes']);
  });
  it('performs zero reads on missing flag or non-demo project', async () => {
    topicMemoryCheckpointEnabled.mockReturnValue(false);
    expect(topicSourceReadEnabled()).toBe(false);
    await expect(read()).rejects.toThrow('memory-source-disabled');
    expect(getDoc).not.toHaveBeenCalled();
    topicMemoryCheckpointEnabled.mockReturnValue(true);
    vi.stubEnv('VITE_ENABLE_REFLECT_MEMORY_SOURCE_RESOLVER','false');
    await expect(read()).rejects.toThrow('memory-source-disabled');
    vi.stubEnv('VITE_ENABLE_REFLECT_MEMORY_SOURCE_RESOLVER','true');
    await expect(read(undefined, { database: { app:{ options:{ projectId:'production' } } } }))
      .rejects.toThrow('memory-source-invalid-scope');
    expect(getDoc).not.toHaveBeenCalled();
  });
  it('refuses a mismatched authenticated UID before reading', async () => {
    auth.currentUser = { uid:'different' };
    await expect(read()).rejects.toThrow('memory-source-invalid-scope');
    expect(getDoc).not.toHaveBeenCalled();
  });
  it('refuses owner changes DURING the async source read', async () => {
    getDoc.mockImplementationOnce(async ref => {
      auth.currentUser = { uid:'different' };
      return snap(store.get(ref.path), ref.id);
    });
    await expect(read()).rejects.toThrow('memory-source-owner-changed');
  });
  it('blocks stale inventory when document changes before first read', async () => {
    store.set(key('sessions','sA'), { ...session, chatHistory:[
      { id:'turn1', role:'user', content:'Исправлено' }, session.chatHistory[1]
    ] });
    await expect(read()).rejects.toThrow('memory-source-changed');
  });
  it('blocks concurrent edits between first and second document read', async () => {
    let calls = 0;
    getDoc.mockImplementation(async ref => {
      calls += 1;
      if (calls === 2) {
        store.set(key('sessions','sA'), { ...session, chatHistory:[
          { ...session.chatHistory[0], content:'Мой текст ещё что-то' },
          session.chatHistory[1]] });
      }
      return snap(store.get(ref.path), ref.id);
    });
    await expect(read()).rejects.toThrow('memory-source-changed');
  });
  it('does not accept missing source document as an empty success', async () => {
    store.delete(key('sessions','sA'));
    await expect(read()).rejects.toThrow('memory-source-document-missing');
  });
  it('does not read unconfirmed session-linked goals or diary notes', async () => {
    const inv = inventoryTopicSources({ownerId,topicId, sessions:[session],
      goals:[{id:'goalLinked',sessionId:'sA',text:'Пока не подтверждено'}] });
    const report = await read(['goals/goalLinked/goalLinked'], { inventory:inv });
    expect(report.resolvedCount).toBe(0);
    expect(report.pendingOwnerConfirmation).toHaveLength(1);
    expect(getDoc).not.toHaveBeenCalled();
  });
  it('rejects wrong source links and extra arbitrary document paths', async () => {
    const inv = inventory();
    inv.records[0].source.documentId = 'other';
    await expect(read(undefined, {inventory:inv})).rejects
      .toThrow('memory-source-invalid-candidate');
    expect(getDoc).not.toHaveBeenCalled();
  });
});
