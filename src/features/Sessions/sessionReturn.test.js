import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runTransaction } from 'firebase/firestore';
import { saveSessionReturn } from './sessionReturn';

vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, root, id) => ({ path: `${root}/${id}` })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ serverTime: true })),
  Timestamp: { now: vi.fn(() => ({ seconds: 1790000000 })) }
}));
const input = {
  userId: 'synthetic-owner', sessionId: 'saved-session',
  visitId: 'stable-visit', note: '  Я сделал два шага и один день пропустил  '
};
let session, writes;
beforeEach(() => {
  vi.clearAllMocks();
  session = { title: 'Мой сеанс', chatHistory: [{ role: 'user', content: 'Привет' }] };
  writes = [];
  runTransaction.mockImplementation(async (_db, callback) => callback({
    get: vi.fn(async () => ({
      exists: () => session !== null,
      data: () => session
    })),
    update: vi.fn((ref, patch) => {
      writes.push({ path: ref.path, patch });
      session = { ...session, ...patch };
    })
  }));
});
describe('PRODUCT-03 confirmed return visits', () => {
  it('writes an authored return once, without changing the transcript or AI provider', async () => {
    const result = await saveSessionReturn(input);
    expect(result.text).toBe('Я сделал два шага и один день пропустил');
    expect(result.author).toBe('user');
    expect(result.type).toBe('return-check-in');
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe('artifacts/reflect-8fdc8/users/synthetic-owner/sessions/saved-session');
    expect(session.chatHistory).toEqual([{ role: 'user', content: 'Привет' }]);
    expect(session.returnCheckIns).toHaveLength(1);
    await saveSessionReturn(input);
    expect(writes).toHaveLength(1);
  });
  it('retains older check-ins and rejects a nonexisting session', async () => {
    session.returnCheckIns = [{ id: 'older', type: 'return-check-in', author: 'user', text: 'Было' }];
    await saveSessionReturn(input);
    expect(session.returnCheckIns.map(x => x.id)).toEqual(['older', 'stable-visit']);
    session = null;
    await expect(saveSessionReturn(input)).rejects.toThrow(/больше не существует/);
  });
  it('guards UID paths, control characters, empty and overlong notes', async () => {
    await expect(saveSessionReturn({ ...input, userId: '../another' })).rejects.toThrow();
    await expect(saveSessionReturn({ ...input, sessionId: '../another' })).rejects.toThrow();
    await expect(saveSessionReturn({ ...input, note: '  ' })).rejects.toThrow();
    await expect(saveSessionReturn({ ...input, note: 'a'.repeat(1201) })).rejects.toThrow();
    await expect(saveSessionReturn({ ...input, note: 'danger\u0000' })).rejects.toThrow();
    expect(writes).toHaveLength(0);
  });
  it('caps embedded returns so Firestore session documents cannot grow without bound', async () => {
    session.returnCheckIns = Array.from({ length: 80 }, (_, i) => ({ id: 'v-' + i }));
    await expect(saveSessionReturn(input)).rejects.toThrow(/лимит/);
    expect(writes).toHaveLength(0);
  });
});
