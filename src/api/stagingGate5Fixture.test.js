import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, ...parts) => ({ path: parts.join('/') })),
  runTransaction: vi.fn(),
  getDocFromServer: vi.fn(),
  serverTimestamp: vi.fn(() => ({ syntheticServerTimestamp: true }))
}));
vi.mock('../firebase/config', () => ({
  appId: 'reflect-8fdc8',
  auth: { app: { options: { projectId: 'reflect-ai-staging' } },
    currentUser: null },
  db: { synthetic: true }, stagingAppCheckEnabled: true
}));
vi.mock('./stagingPreviewGate5Audit', () => ({
  GATE5_SESSION_ID: 'ai01k_gate4_synthetic_20261111',
  GATE5_SESSION_TITLE: 'AI-01K Gate 4 Synthetic QA',
  gate5PreviewQaUiEnabled: true
}));

const { prepareGate5Fixture, auditGate5PrivateEntitlement, GATE5_FIXTURE_TURNS } =
  await import('./stagingGate5Fixture');
const { runTransaction, getDocFromServer, doc } = await import('firebase/firestore');
const { auth } = await import('../firebase/config');

const UID = 'jackSyntheticStagingUid_12345';
const user = () => ({
  uid: UID, email: 'qa-owner@example.test',
  isAnonymous: false, emailVerified: true
});
let existing;
let writes;
let readTarget;

beforeEach(() => {
  vi.clearAllMocks();
  auth.currentUser = user();
  existing = null;
  writes = [];
  readTarget = null;
  runTransaction.mockImplementation(async (db, callback) =>
    callback({
      get: async target => {
        readTarget = target;
        return { exists: () => Boolean(existing), data: () => existing };
      },
      set: (target, payload) => { writes.push({ target, payload }); }
    })
  );
});

describe('Stage05 Gate5 owner-only fixture setup (synthetic, no live Firebase)', () => {
  test('creates only an isolated deterministic owner fixture on explicit call', async () => {
    expect(await prepareGate5Fixture(UID)).toBe('created');
    expect(doc).toHaveBeenCalledTimes(1);
    expect(readTarget.path).toBe(
      'artifacts/reflect-8fdc8/users/' + UID +
      '/sessions/ai01k_gate4_synthetic_20261111'
    );
    expect(writes).toHaveLength(1);
    expect(writes[0].target).toBe(readTarget);
    expect(writes[0].payload.title).toBe('AI-01K Gate 4 Synthetic QA');
    expect(writes[0].payload.chatHistory).toEqual(GATE5_FIXTURE_TURNS);
    expect(writes[0].payload.chatHistory).toHaveLength(5);
    expect(writes[0].payload.chatHistory.slice(-4).map(x => x.content))
      .toEqual([
        'AI01K_TURN_02_INCLUDE', 'AI01K_TURN_03_INCLUDE',
        'AI01K_TURN_04_INCLUDE', 'AI01K_TURN_05_INCLUDE'
      ]);
    expect(JSON.stringify(writes)).not.toMatch(/id.token|app.check|password/i);
  });

  test('exact existing fixture is idempotent and never overwritten', async () => {
    existing = { title: 'AI-01K Gate 4 Synthetic QA',
      chatHistory: GATE5_FIXTURE_TURNS.map(x => ({ ...x })) };
    expect(await prepareGate5Fixture(UID)).toBe('already-present');
    expect(writes).toHaveLength(0);
  });

  test('refuses a collision instead of destroying an old session', async () => {
    existing = { title: 'AI-01K Gate 4 Synthetic QA',
      chatHistory: [{ role: 'user', content: 'Owner real data' }] };
    await expect(prepareGate5Fixture(UID))
      .rejects.toThrow('fixture-id-collision');
    expect(writes).toHaveLength(0);
  });

  test.each([
    ['wrong UID', { uid: 'other-staging-uid', emailVerified: true }],
    ['unverified', { emailVerified: false }],
    ['anonymous', { isAnonymous: true }],
    ['missing email auth', null]
  ])('denies %s before Firestore operations', async (_name, override) => {
    auth.currentUser = override === null ? null : { ...user(), ...override };
    await expect(prepareGate5Fixture(UID))
      .rejects.toThrow('fixture-account-not-ready');
    expect(runTransaction).not.toHaveBeenCalled();
  });

  test('rejects owner switch during transaction before any write', async () => {
    runTransaction.mockImplementationOnce(async (_db, callback) => {
      auth.currentUser = { ...user(), uid: 'switched-owner' };
      return callback({ get: vi.fn(), set: vi.fn() });
    });
    await expect(prepareGate5Fixture(UID))
      .rejects.toThrow('fixture-owner-changed');
    expect(writes).toHaveLength(0);
  });

  test('does not claim success if owner switches after write/readback', async () => {
    runTransaction.mockImplementationOnce(async () => {
      auth.currentUser = { ...user(), uid: 'switched-owner' };
      return 'created';
    });
    await expect(prepareGate5Fixture(UID))
      .rejects.toThrow('fixture-owner-changed');
  });

  test('network failures fail closed without exposing backend details', async () => {
    runTransaction.mockRejectedValueOnce(new Error('token-or-private-PATH'));
    await expect(prepareGate5Fixture(UID))
      .rejects.toThrow('fixture-write-unavailable');
    expect(writes).toHaveLength(0);
  });
});

test('private entitlement probe passes only explicit permission-denied', async () => {
  auth.currentUser = user();
  getDocFromServer.mockRejectedValueOnce({ code: 'permission-denied' });
  expect(await auditGate5PrivateEntitlement(UID)).toBe('denied');
  const call = doc.mock.calls.at(-1);
  expect(call.slice(1)).toEqual([
    '_reflectAiPrivate', 'reflect-8fdc8', 'entitlements', UID
  ]);
  expect(runTransaction).not.toHaveBeenCalled();
});

test('private entitlement probe blocks public reads including missing document', async () => {
  getDocFromServer.mockResolvedValueOnce({ exists: () => false,
    data: () => ({ private: 'never exposed' }) });
  expect(await auditGate5PrivateEntitlement(UID)).toBe('unsafe-readable');
  getDocFromServer.mockRejectedValueOnce({ code: 'unavailable' });
  expect(await auditGate5PrivateEntitlement(UID)).toBe('unavailable');
});

test('private entitlement probe refuses owner mismatch and no UID leaks', async () => {
  auth.currentUser = { ...user(), uid: 'anotherUid' };
  await expect(auditGate5PrivateEntitlement(UID))
    .rejects.toThrow('fixture-account-not-ready');
  expect(getDocFromServer).not.toHaveBeenCalled();
});
