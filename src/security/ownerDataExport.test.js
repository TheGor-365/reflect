import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp, GeoPoint, Bytes } from 'firebase/firestore';
import {
  buildOwnerExport, serializeOwnerField, OWNER_EXPORT_COLLECTIONS
} from './ownerDataExport';

const testState = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'ownerA', isAnonymous: false, email: 'not-exported@example.test', accessToken: 'PRIVATE_TOKEN' } }
}));
vi.mock('../firebase/config', () => ({
  auth: testState.auth, db: {}, appId: 'reflect-8fdc8'
}));
vi.mock('firebase/firestore', async importOriginal => {
  const sdk = await importOriginal();
  return {
    ...sdk,
    doc: vi.fn((_db, ...parts) => ({ path: parts.join('/') })),
    collection: vi.fn((_db, ...parts) => ({ path: parts.join('/') })),
    getDoc: vi.fn(),
    getDocs: vi.fn()
  };
});
import { collection, doc, getDocFromServer, getDocsFromServer, setDoc } from 'firebase/firestore';

const date = new Date('2026-11-06T12:00:00.000Z');
const profile = { name: 'Synthetic Owner', createdAt: Timestamp.fromDate(date) };
const notes = [{
  id: 'diary-1',
  data: () => ({ title: 'Private synthetic entry',
    entries: [{ text: 'Synthetic line one', createdAt: Timestamp.fromDate(date) }] })
}];

beforeEach(() => {
  vi.clearAllMocks();
  testState.auth.currentUser = {
    uid: 'ownerA', isAnonymous: false, email: 'not-exported@example.test',
    accessToken: 'PRIVATE_TOKEN'
  };
  getDocFromServer.mockResolvedValue({
    id: 'userProfile', exists: () => true, data: () => profile
  });
  getDocsFromServer.mockImplementation(async ref => ({
    docs: ref.path.endsWith('/diaryNotes') ? notes :
      ref.path.endsWith('/moods') ?
        [{ id: 'mood-1', data: () => ({ mood: 'neutral', intensity: 3 }) }] : []
  }));
});

describe('owner-scoped Firestore JSON export', () => {
  it('reads every known collection and profile under the same authenticated UID', async () => {
    const result = await buildOwnerExport({ now: date });
    const output = JSON.parse(result.json);
    expect(output.schemaVersion).toBe(1);
    expect(output.format).toBe('reflect-owner-data-export');
    expect(output.source.uid).toBe('ownerA');
    expect(output.profile.id).toBe('userProfile');
    expect(output.collections.diaryNotes).toHaveLength(1);
    expect(output.collections.moods).toHaveLength(1);
    expect(Object.keys(output.collections)).toEqual(OWNER_EXPORT_COLLECTIONS);
    expect(output.collections.diaryNotes[0].fields.entries[0].createdAt)
      .toEqual({ __reflectFirestoreType: 'timestamp',
        seconds: Timestamp.fromDate(date).seconds, nanoseconds: 0 });
    expect(result.count).toBe(3);
    expect(doc).toHaveBeenCalledWith({}, 'artifacts/reflect-8fdc8/users/ownerA',
      'profiles', 'userProfile');
    for (const name of OWNER_EXPORT_COLLECTIONS) {
      expect(collection).toHaveBeenCalledWith({},
        'artifacts/reflect-8fdc8/users/ownerA', name);
    }
    expect(result.json).not.toContain('PRIVATE_TOKEN');
    expect(result.json).not.toContain('not-exported@example.test');
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('fails closed if any collection is inaccessible rather than downloading a partial archive', async () => {
    getDocsFromServer.mockRejectedValueOnce({ code: 'permission-denied' });
    await expect(buildOwnerExport()).rejects.toEqual({ code: 'permission-denied' });
  });

  it('aborts if account changes during the reads', async () => {
    getDocsFromServer.mockImplementationOnce(async () => {
      testState.auth.currentUser = { uid: 'ownerB', isAnonymous: true };
      return { docs: [] };
    });
    await expect(buildOwnerExport()).rejects.toThrow('Аккаунт изменился');
  });

  it('rejects logged-out access and does not query Firestore', async () => {
    testState.auth.currentUser = null;
    await expect(buildOwnerExport()).rejects.toThrow('после входа');
    expect(getDocFromServer).not.toHaveBeenCalled();
  });

  it('permits a missing profile when the collection requests succeeded', async () => {
    getDocFromServer.mockResolvedValue({ id: 'userProfile', exists: () => false });
    const output = JSON.parse((await buildOwnerExport()).json);
    expect(output.profile).toBeNull();
    expect(output.source.uid).toBe('ownerA');
  });

  it('encodes nested Firestore values with lossless type markers', () => {
    const original = {
      nested: [Timestamp.fromDate(date), new GeoPoint(40, 45),
        Bytes.fromUint8Array(new Uint8Array([1, 2, 3])), date, null]
    };
    expect(serializeOwnerField(original)).toEqual({
      nested: [
        { __reflectFirestoreType: 'timestamp',
          seconds: Timestamp.fromDate(date).seconds, nanoseconds: 0 },
        { __reflectFirestoreType: 'geopoint', latitude: 40, longitude: 45 },
        { __reflectFirestoreType: 'bytes', base64: 'AQID' },
        { __reflectFirestoreType: 'date', iso: date.toISOString() }, null
      ]
    });
  });

  it('refuses unsupported types and circular data instead of losing values', () => {
    const cycle = {}; cycle.self = cycle;
    expect(() => serializeOwnerField(cycle)).toThrow('Циклические');
    expect(() => serializeOwnerField({ missing: undefined })).toThrow('неподдерживаемое');
    expect(() => serializeOwnerField({ invalid: Infinity })).toThrow('неподдерживаемое');
  });

  it('rejects duplicate document ids rather than reporting a misleading complete export', async () => {
    getDocsFromServer.mockResolvedValue({ docs: [
      { id: 'dup', data: () => ({}) },
      { id: 'dup', data: () => ({}) }
    ] });
    await expect(buildOwnerExport()).rejects.toThrow('недопустимого ID');
  });
});
