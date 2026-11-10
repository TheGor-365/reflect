import { auth } from '../firebase/config';
import { getLimitedUseToken } from 'firebase/app-check';
import { auditStagingAuthAppCheck } from './stagingSecurityAudit';

vi.mock('../firebase/config', () => ({
  auth: { currentUser: null },
  appCheckClient: { demo: true }
}));
vi.mock('firebase/app-check', () => ({
  getLimitedUseToken: vi.fn()
}));
vi.mock('./reflectRailwayService', () => ({ railwayAiEnabled: true }));

const reply = (status, data) => ({
  status,
  json: async () => data
});
const good = () => reply(200, { status: 'ready', model: 'grok-4.3' });
const denied = () => reply(401, { error: 'unauthenticated' });

beforeEach(() => {
  vi.clearAllMocks();
  auth.currentUser = {
    uid: 'synthetic-owner',
    getIdToken: vi.fn(async () => 'synthetic-auth-token')
  };
  getLimitedUseToken.mockResolvedValue({ token: 'synthetic-limited-use-token' });
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(good())
    .mockResolvedValueOnce(denied()));
});
afterEach(() => { vi.unstubAllGlobals(); });

test('three probes verify rejection, genuine signed diagnostics, and replay denial', async () => {
  expect(await auditStagingAuthAppCheck()).toEqual({
    status: 'verified', checks: 3, readiness: 'ready'
  });
  expect(fetch).toHaveBeenCalledTimes(3);
  const first = fetch.mock.calls[0][1];
  const second = fetch.mock.calls[1][1];
  const third = fetch.mock.calls[2][1];
  expect(first.headers.Authorization).toBeUndefined();
  expect(first.headers['X-Firebase-AppCheck']).toBeUndefined();
  expect(second.headers.Authorization).toBe('Bearer synthetic-auth-token');
  expect(second.headers['X-Firebase-AppCheck']).toBe('synthetic-limited-use-token');
  expect(third.headers).toEqual(second.headers);
  for (const [url, options] of fetch.mock.calls) {
    expect(url).toBe('https://reflect-ai-api-staging.up.railway.app/v1/ai/diagnostics');
    expect(options.body).toBe('{}');
    expect(options.credentials).toBe('omit');
    expect(JSON.stringify(options)).not.toContain('diary');
    expect(JSON.stringify(options)).not.toContain('session-');
  }
  expect(getLimitedUseToken).toHaveBeenCalledTimes(1);
});

test('does not mint tokens when anonymous request is incorrectly accepted', async () => {
  fetch.mockReset().mockResolvedValue(reply(200, { status: 'ready', model: 'grok-4.3' }));
  await expect(auditStagingAuthAppCheck()).rejects.toThrow('security-audit-unavailable');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(getLimitedUseToken).not.toHaveBeenCalled();
});

test('signed denial is not a false success and does not attempt replay', async () => {
  fetch.mockReset()
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(reply(403, { error: 'permission-denied' }));
  await expect(auditStagingAuthAppCheck()).rejects.toThrow('permission-denied');
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('accepting replay is a hard failure, never a security PASS', async () => {
  fetch.mockReset()
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(good())
    .mockResolvedValueOnce(good());
  await expect(auditStagingAuthAppCheck()).rejects.toThrow('security-audit-unavailable');
});

test('unknown server error messages are redacted', async () => {
  fetch.mockReset()
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(reply(500, { error: 'SECRET_PRIVATE_CONTENT' }));
  await expect(auditStagingAuthAppCheck()).rejects.toThrow('security-audit-unavailable');
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('authentication switch before signed request denies audit', async () => {
  getLimitedUseToken.mockImplementation(async () => {
    auth.currentUser = { uid: 'other-owner', getIdToken: vi.fn() };
    return { token: 'synthetic-limited-use-token' };
  });
  await expect(auditStagingAuthAppCheck()).rejects.toThrow('unauthenticated');
  expect(fetch).toHaveBeenCalledTimes(1);
});
