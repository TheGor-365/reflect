import { beforeEach, expect, test, vi } from 'vitest';
import { saveSessionMode } from './sessionModePersistence';

const mocks = vi.hoisted(() => ({
  update: vi.fn(), read: vi.fn(), doc: vi.fn(),
  del: vi.fn(), timestamp: vi.fn()
}));
vi.mock('../../firebase/config', () => ({
  db: { label: 'staging' }, appId: 'reflect-8fdc8'
}));
vi.mock('firebase/firestore', () => ({
  doc: (...args) => {
    mocks.doc(...args);
    return { path: args.slice(1).join('/') };
  },
  updateDoc: (...args) => mocks.update(...args),
  getDocFromServer: (...args) => mocks.read(...args),
  deleteField: () => mocks.del(),
  serverTimestamp: () => mocks.timestamp()
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue();
  mocks.del.mockReturnValue({ deleteField: true });
  mocks.timestamp.mockReturnValue({ serverTime: true });
  mocks.read.mockResolvedValue({ exists: () => true,
    data: () => ({ interactionMode: 'coach' }) });
});

test('M4.2 saves explicit mode to ONLY chosen owner session with server readback', async () => {
  const mode = await saveSessionMode({
    userId: 'synthetic-eric', sessionId: 'session-owner-1',
    mode: 'coach'
  });
  expect(mode).toBe('coach');
  expect(mocks.doc.mock.calls[0].slice(1)).toEqual([
    'artifacts', 'reflect-8fdc8', 'users', 'synthetic-eric',
    'sessions', 'session-owner-1'
  ]);
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(mocks.update.mock.calls[0][1]).toMatchObject({
    interactionMode: 'coach', updatedAt: { serverTime: true }
  });
  expect(mocks.read).toHaveBeenCalledOnce();
});

test('M4.2 account fallback removes ONLY session override', async () => {
  mocks.read.mockResolvedValueOnce({ exists: () => true, data: () => ({}) });
  expect(await saveSessionMode({
    userId: 'synthetic-eric', sessionId: 'session-owner-1',
    mode: 'account'
  })).toBe('account');
  expect(mocks.del).toHaveBeenCalledOnce();
  expect(mocks.update.mock.calls[0][1]).toMatchObject({
    interactionMode: { deleteField: true }
  });
});

test('M4.2 rejects forged IDs, unknown modes and unconfirmed readback', async () => {
  for (const values of [
    { userId: '../jack', sessionId: 'session-1', mode: 'coach' },
    { userId: 'eric', sessionId: '../jack', mode: 'coach' },
    { userId: 'eric', sessionId: 'session-1', mode: 'therapist' },
    { userId: 'eric', sessionId: 'session-1', mode: 'administrator' }
  ]) {
    await expect(saveSessionMode(values)).rejects.toThrow('session-mode-invalid');
  }
  expect(mocks.update).not.toHaveBeenCalled();
  mocks.read.mockResolvedValueOnce({
    exists: () => true, data: () => ({ interactionMode: 'analytic' })
  });
  await expect(saveSessionMode({
    userId: 'eric', sessionId: 'session-1', mode: 'support'
  })).rejects.toThrow('session-mode-unconfirmed');
});
