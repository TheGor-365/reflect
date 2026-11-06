import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  demoRecoveryAllowed, inspectOwnerArchive, restoreMissingOwnerDocsInDemo
} from './ownerDataRecovery';

const state = vi.hoisted(() => ({
  auth: {
    currentUser: { uid: 'ownerA' },
    app: { options: { projectId: 'demo-reflect-auth-qa' } }
  }
}));
vi.mock('../firebase/config', () => ({
  auth: state.auth, appId: 'reflect-8fdc8', db: {}
}));
vi.mock('firebase/firestore', async importOriginal => {
  const sdk = await importOriginal();
  return {
    ...sdk,
    doc: vi.fn((_db, path) => ({ path })),
    runTransaction: vi.fn()
  };
});
import { doc, runTransaction } from 'firebase/firestore';

const owner = 'ownerA';
const namespace = 'reflect-8fdc8';
const root = 'artifacts/' + namespace + '/users/' + owner;
const timestamp = { __reflectFirestoreType: 'timestamp', seconds: 1793966400, nanoseconds: 42 };
function archive() {
  return {
    format: 'reflect-owner-data-export',
    schemaVersion: 1,
    exportedAt: '2026-11-06T12:00:00.000Z',
    source: { uid: owner, appId: namespace, isAnonymous: false },
    profile: {
      id: 'userProfile', fields: { name: 'Synthetic owner', createdAt: timestamp }
    },
    collections: {
      sessions: [], goals: [],
      moods: [{ id: 'mood001', fields: { mood: 'happy', intensity: 4 } }],
      diaryNotes: [{ id: 'note001', fields: {
        title: 'Synthetic diary', entries: [{
          text: 'This is a fictional test', createdAt: timestamp
        }]
      }}]
    }
  };
}
const inspect = (obj = archive(), settings = {}) =>
  inspectOwnerArchive(JSON.stringify(obj), { uid: owner, namespace, ...settings });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
  state.auth.currentUser = { uid: owner };
  state.auth.app.options.projectId = 'demo-reflect-auth-qa';
});
afterEach(() => vi.unstubAllEnvs());

describe('strict portable owner archive validation', () => {
  it('previews only counts and verifies exact owner and typed nested fields', () => {
    const result = inspect();
    expect(result).toMatchObject({
      uid: owner, total: 3, hasProfile: true, canRestore: true,
      counts: { sessions: 0, goals: 0, moods: 1, diaryNotes: 1 }
    });
    expect(result.documents[0].path).toBe(root + '/profiles/userProfile');
    expect(result.documents[2].fields.entries[0].createdAt).toEqual(timestamp);
  });

  it('rejects malformed files and other UID, namespace or unknown version', () => {
    expect(() => inspectOwnerArchive('{broken', { uid: owner, namespace }))
      .toThrow('JSON');
    expect(() => inspect(archive(), { uid: 'different-user' })).toThrow('другому UID');
    const bad = archive();
    bad.schemaVersion = 27;
    expect(() => inspect(bad)).toThrow('поддерживаемой');
    bad.schemaVersion = 1;
    bad.source.appId = 'another-app';
    expect(() => inspect(bad)).toThrow('другому UID');
  });

  it('rejects missing/unknown collections and duplicate document IDs', () => {
    const bad = archive();
    bad.collections.someNewArea = [];
    expect(() => inspect(bad)).toThrow('коллекции');
    delete bad.collections.someNewArea;
    bad.collections.diaryNotes.push(bad.collections.diaryNotes[0]);
    expect(() => inspect(bad)).toThrow('повторяющийся');
    delete bad.collections.goals;
    expect(() => inspect(bad)).toThrow('коллекции');
  });

  it('rejects untrusted document paths, prototype-pollution keys and type markers', () => {
    const bad = archive();
    bad.collections.moods[0].id = '../ownerB';
    expect(() => inspect(bad)).toThrow('ID документа');
    bad.collections.moods[0].id = 'mood001';
    bad.collections.diaryNotes[0].fields.payload =
      JSON.parse('{"__proto__":{"admin":true}}');
    expect(() => inspect(bad)).toThrow('запрещённое имя поля');
    delete bad.collections.diaryNotes[0].fields.payload;
    bad.collections.diaryNotes[0].fields.ref = {
      __reflectFirestoreType: 'reference',
      path: 'artifacts/reflect-8fdc8/users/ownerB/diaryNotes/private'
    };
    expect(() => inspect(bad)).toThrow('за пределы аккаунта');
    delete bad.collections.diaryNotes[0].fields.ref;
    bad.collections.diaryNotes[0].fields.createdAt = {
      __reflectFirestoreType: 'timestamp', seconds: 4,
      nanoseconds: -1
    };
    expect(() => inspect(bad)).toThrow('отметка времени');
  });

  it('refuses more than the bounded atomic restore capacity but still permits preview', () => {
    const large = archive();
    large.collections.moods = Array.from({ length: 101 }, (_, i) => ({
      id: 'synthetic' + i, fields: { mood: 'happy' }
    }));
    const result = inspect(large);
    expect(result.canRestore).toBe(false);
    expect(result.total).toBe(103);
  });
});

describe('safe localhost-only restore', () => {
  it('rejects any production, remote host or other project', () => {
    expect(demoRecoveryAllowed({ mode: 'false', host: 'localhost',
      projectId: 'demo-reflect-auth-qa' })).toBe(false);
    expect(demoRecoveryAllowed({ mode: 'true', host: 'reflect-three.vercel.app',
      projectId: 'demo-reflect-auth-qa' })).toBe(false);
    expect(demoRecoveryAllowed({ mode: 'true', host: '127.0.0.1',
      projectId: 'reflect-8fdc8' })).toBe(false);
  });

  it('rejects signed-out and mismatched UID before opening any transaction', async () => {
    const result = inspect();
    state.auth.currentUser = { uid: 'another-user' };
    await expect(restoreMissingOwnerDocsInDemo(result, { uid: owner }))
      .rejects.toThrow('UID');
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('refuses every differing existing document before writing even one', async () => {
    const result = inspect();
    const tx = {
      get: vi.fn().mockResolvedValue({
        exists: () => true,
        data: () => ({ someField: 'Different value' })
      }),
      set: vi.fn()
    };
    runTransaction.mockImplementationOnce((_db, work) => work(tx));
    await expect(restoreMissingOwnerDocsInDemo(result, { uid: owner }))
      .rejects.toThrow('отличается');
    expect(tx.set).not.toHaveBeenCalled();
  });

  it('restores missing documents in one transaction with typed timestamps', async () => {
    const result = inspect();
    const tx = {
      get: vi.fn().mockResolvedValue({ exists: () => false }),
      set: vi.fn()
    };
    runTransaction.mockImplementationOnce((_db, work) => work(tx));
    const summary = await restoreMissingOwnerDocsInDemo(result, { uid: owner });
    expect(summary).toEqual({ created: 3, alreadyPresent: 0 });
    expect(tx.set).toHaveBeenCalledTimes(3);
    expect(tx.get).toHaveBeenCalledTimes(3);
    const data = tx.set.mock.calls[2][1];
    expect(data.entries[0].createdAt).toBeInstanceOf(Timestamp);
    expect(data.entries[0].createdAt.nanoseconds).toBe(42);
    expect(doc).toHaveBeenCalledWith({}, root + '/diaryNotes/note001');
  });

  it('leaves existing matching documents intact and writes only missing ones', async () => {
    const result = inspect();
    const tx = {
      get: vi.fn()
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({
            name: 'Synthetic owner',
            createdAt: new Timestamp(timestamp.seconds, timestamp.nanoseconds)
          })
        })
        .mockResolvedValue({ exists: () => false }),
      set: vi.fn()
    };
    runTransaction.mockImplementationOnce((_db, work) => work(tx));
    const summary = await restoreMissingOwnerDocsInDemo(result, { uid: owner });
    expect(summary).toEqual({ created: 2, alreadyPresent: 1 });
    expect(tx.set).toHaveBeenCalledTimes(2);
  });
});
