import { deleteOwnerSession } from './sessionDeletion';
import { doc, runTransaction } from 'firebase/firestore';

vi.mock('../../firebase/config', () => ({
  db: { kind: 'mocked-db' }, appId: 'reflect-8fdc8'
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ path: 'synthetic-session-ref' })),
  runTransaction: vi.fn()
}));

let documentState;
let present;
let tx;
beforeEach(() => {
  vi.clearAllMocks();
  documentState = { title: 'Мой сеанс' };
  present = true;
  tx = {
    get: vi.fn(async () => ({ exists: () => present, data: () => documentState })),
    delete: vi.fn()
  };
  vi.mocked(runTransaction).mockImplementation(async (_db, perform) => perform(tx));
});

test('deletes exactly one existing, non-archived owner session transactionally', async () => {
  await expect(deleteOwnerSession('eric-uid', 'session-a')).resolves.toBe('session-a');
  expect(doc).toHaveBeenCalledOnce();
  const [db, ...path] = vi.mocked(doc).mock.calls[0];
  expect(db).toEqual({ kind: 'mocked-db' });
  expect(path).toEqual(['artifacts', 'reflect-8fdc8', 'users',
    'eric-uid', 'sessions', 'session-a']);
  expect(runTransaction).toHaveBeenCalledOnce();
  expect(tx.get).toHaveBeenCalledExactlyOnceWith({ path: 'synthetic-session-ref' });
  expect(tx.delete).toHaveBeenCalledExactlyOnceWith({ path: 'synthetic-session-ref' });
});

test.each([
  ['', 'session-a'], ['another/user', 'session-a'],
  ['eric-uid', '../session-a'], ['eric-uid', ''], [null, 'session-a']
])('rejects unsafe owner or session identifier', async (owner, id) => {
  await expect(deleteOwnerSession(owner, id)).rejects.toThrow('invalid-session-deletion');
  expect(doc).not.toHaveBeenCalled();
  expect(runTransaction).not.toHaveBeenCalled();
});

test('archived session cannot be deleted even after an earlier UI confirmation', async () => {
  documentState = { archivedAt: { seconds: 1730000000 } };
  await expect(deleteOwnerSession('eric-uid', 'session-a'))
    .rejects.toThrow('archived-session-deletion-blocked');
  expect(tx.get).toHaveBeenCalledOnce();
  expect(tx.delete).not.toHaveBeenCalled();
});

test('legacy session without archivedAt is still eligible for confirmed deletion', async () => {
  documentState = { title: 'Legacy' };
  await expect(deleteOwnerSession('eric-uid', 'session-a')).resolves.toBe('session-a');
  expect(tx.delete).toHaveBeenCalledOnce();
});

test('document missing after confirmation is not reported as successful deletion', async () => {
  present = false;
  await expect(deleteOwnerSession('eric-uid', 'session-a'))
    .rejects.toThrow('session-no-longer-exists');
  expect(tx.delete).not.toHaveBeenCalled();
});

test('transaction retry after a concurrent archive does not commit the delete', async () => {
  let attempt = 0;
  vi.mocked(runTransaction).mockImplementationOnce(async (_db, perform) => {
    const abandonedAttempt = { get: tx.get, delete: vi.fn() };
    await perform(abandonedAttempt); // Simulated conflicting transaction; never committed.
    attempt++;
    documentState = { archivedAt: { seconds: 1730000000 } };
    return perform(tx); // SDK replays the callback after conflict.
  });
  await expect(deleteOwnerSession('eric-uid', 'session-a'))
    .rejects.toThrow('archived-session-deletion-blocked');
  expect(attempt).toBe(1);
  expect(tx.delete).not.toHaveBeenCalled();
});

test('commit failures are surfaced; not falsely marked as deletion success', async () => {
  vi.mocked(runTransaction).mockRejectedValueOnce(new Error('offline'));
  await expect(deleteOwnerSession('eric-uid', 'session-a')).rejects.toThrow('offline');
});
