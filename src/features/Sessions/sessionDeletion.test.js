import { deleteOwnerSession } from './sessionDeletion';
import { doc, deleteDoc } from 'firebase/firestore';

vi.mock('../../firebase/config', () => ({
  db: { kind: 'mocked-db' }, appId: 'reflect-8fdc8'
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ path: 'synthetic-session-ref' })),
  deleteDoc: vi.fn()
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteDoc).mockResolvedValue(undefined);
});
test('deletes exactly one session from authenticated owner-scoped collection', async () => {
  await expect(deleteOwnerSession('eric-uid', 'session-a')).resolves.toBe('session-a');
  expect(doc).toHaveBeenCalledOnce();
  const [db, ...path] = vi.mocked(doc).mock.calls[0];
  expect(db).toEqual({ kind: 'mocked-db' });
  expect(path).toEqual(['artifacts', 'reflect-8fdc8', 'users',
    'eric-uid', 'sessions', 'session-a']);
  expect(deleteDoc).toHaveBeenCalledExactlyOnceWith({
    path: 'synthetic-session-ref'
  });
});
test.each([
  ['', 'session-a'], ['another/user', 'session-a'],
  ['eric-uid', '../session-a'], ['eric-uid', ''], [null, 'session-a']
])('rejects unsafe owner or session identifier', async (owner, id) => {
  await expect(deleteOwnerSession(owner, id)).rejects.toThrow('invalid-session-deletion');
  expect(doc).not.toHaveBeenCalled();
  expect(deleteDoc).not.toHaveBeenCalled();
});
test('write failures are not swallowed or converted into false deletion success', async () => {
  vi.mocked(deleteDoc).mockRejectedValueOnce(new Error('offline'));
  await expect(deleteOwnerSession('eric-uid', 'session-a')).rejects.toThrow('offline');
});
