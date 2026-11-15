import { beforeEach, expect, test, vi } from 'vitest';
import { saveReadinessEvidence, clearReadinessEvidence }
  from './readinessPersistence';

const fixtures = vi.hoisted(() => ({
  data: null, paths: [], writes: [], denyRead: false
}));
const source = {
  id: 'user-owner-001', role: 'user',
  content: 'Я хочу опубликовать MVP через десять дней.'
};
vi.mock('../../firebase/config', () => ({
  db: { name: 'synthetic-owner' }, appId: 'reflect-8fdc8'
}));
vi.mock('firebase/firestore', () => ({
  doc: (...args) => {
    const path = args.slice(1).join('/');
    fixtures.paths.push(path);
    return { path };
  },
  serverTimestamp: () => ({ serverClock: true }),
  deleteField: () => ({ deleted: true }),
  getDocFromServer: async () => ({
    exists: () => !fixtures.denyRead,
    data: () => fixtures.data
  }),
  runTransaction: async (_db, fn) => {
    const tx = {
      get: async () => ({
        exists: () => !fixtures.denyRead,
        data: () => fixtures.data
      }),
      update: (_ref, changes) => {
        fixtures.writes.push(changes);
        fixtures.data = { ...fixtures.data,
          readinessEvidence: { ...fixtures.data.readinessEvidence } };
        for (const [key, value] of Object.entries(changes)) {
          if (!key.startsWith('readinessEvidence.')) continue;
          const slot = key.slice('readinessEvidence.'.length);
          if (value?.deleted) delete fixtures.data.readinessEvidence[slot];
          else fixtures.data.readinessEvidence[slot] = value;
        }
      }
    };
    return fn(tx);
  }
}));
const input = {
  userId: 'synthetic-eric', sessionId: 'session-eric',
  slot: 'desiredResult', sourceTurnId: source.id,
  quote: 'Хочу опубликовать' // mismatch unless changed below
};
beforeEach(() => {
  fixtures.data = { chatHistory: [source], readinessEvidence: {} };
  fixtures.paths = []; fixtures.writes = []; fixtures.denyRead = false;
});

test('M5a transactional owner evidence requires exact quote + readback', async () => {
  const result = await saveReadinessEvidence({
    ...input, quote: 'опубликовать MVP через десять дней.',
    confirmed: true
  });
  expect(result.status).toBe('confirmed');
  expect(fixtures.writes).toHaveLength(1);
  expect(fixtures.paths[0]).toBe(
    'artifacts/reflect-8fdc8/users/synthetic-eric/sessions/session-eric'
  );
  const mark = fixtures.data.readinessEvidence.desiredResult;
  expect(mark.sourceTurnId).toBe(source.id);
  expect(mark.confirmedByOwner).toBe(true);
  expect(mark.confirmedAt).toEqual({ serverClock: true });
  expect(fixtures.writes[0]).not.toHaveProperty('chatHistory');
  expect(fixtures.writes[0]).not.toHaveProperty('recommendations');
  expect(fixtures.writes[0]).not.toHaveProperty('goals');
});

test('M5a refuses unsaved user assent, forged source, AI quote and invalid slot', async () => {
  const valid = { ...input, quote: 'опубликовать MVP через десять дней.' };
  for (const bad of [
    { ...valid, confirmed: false },
    { ...valid, sourceTurnId: 'assistant-001', confirmed: true },
    { ...valid, slot: 'clinicalDiagnosis', confirmed: true },
    { ...valid, quote: 'I invented a quote', confirmed: true },
    { ...valid, userId: '../jack', confirmed: true }
  ]) {
    await expect(saveReadinessEvidence(bad)).rejects.toThrow();
  }
  expect(fixtures.writes).toHaveLength(0);
});

test('M5a disputed source scores zero and manual revoke deletes only chosen slot', async () => {
  await saveReadinessEvidence({
    ...input, quote: 'опубликовать MVP через десять дней.',
    status: 'disputed', confirmed: true
  });
  expect(fixtures.data.readinessEvidence.desiredResult.status).toBe('disputed');
  await expect(clearReadinessEvidence({
    userId: 'synthetic-eric', sessionId: 'session-eric',
    slot: 'desiredResult'
  })).resolves.toBe(true);
  expect(fixtures.data.readinessEvidence.desiredResult).toBeUndefined();
  expect(fixtures.data.chatHistory).toEqual([source]);
});

test('M5a absent source or unreadable session cannot write evidence', async () => {
  fixtures.denyRead = true;
  await expect(saveReadinessEvidence({
    ...input, quote: 'опубликовать MVP через десять дней.',
    confirmed: true
  })).rejects.toThrow('readiness-source-unverified');
  expect(fixtures.writes).toHaveLength(0);
});
