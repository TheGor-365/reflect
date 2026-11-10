import { auth } from '../firebase/config';
import { getLimitedUseToken } from 'firebase/app-check';
import { auditStagingConsentEndpoint } from './stagingConsentEndpointAudit';

vi.mock('../firebase/config', () => ({
  auth: { currentUser: null },
  appCheckClient: { mock: true }
}));
vi.mock('firebase/app-check', () => ({
  getLimitedUseToken: vi.fn()
}));
vi.mock('./reflectRailwayService', () => ({
  railwayAiEnabled: true
}));

const response = (status, json) => ({ status, json: async () => json });
const denied = () => response(401, { error: 'unauthenticated' });
const listed = (grants = []) => response(200, { grants });
const revoked = () => response(200, { status: 'revoked' });
const uuid = 'a20b340c-6def-4a78-9abc-0def12345678';

let uuidSpy;
beforeEach(() => {
  vi.clearAllMocks();
  uuidSpy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(uuid);
  auth.currentUser = {
    uid: 'owner-synthetic',
    getIdToken: vi.fn(async () => 'synthetic-firebase-id-token')
  };
  getLimitedUseToken
    .mockResolvedValueOnce({ token: 'limited-token-A' })
    .mockResolvedValueOnce({ token: 'limited-token-B' });
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(listed())
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(revoked()));
});
afterEach(() => {
  uuidSpy.mockRestore();
  vi.unstubAllGlobals();
});

test('live audit verifies signed list, consumed-token replay and no-op revoke without any grant', async () => {
  expect(await auditStagingConsentEndpoint()).toEqual({
    status: 'verified', checks: 4
  });
  expect(fetch).toHaveBeenCalledTimes(4);
  const [anonymous, list, replay, noOpRevoke] = fetch.mock.calls;
  for (const [url, options] of fetch.mock.calls) {
    expect(url).toBe('https://reflect-ai-api-staging.up.railway.app/v1/privacy/context-consent');
    expect(options.credentials).toBe('omit');
    expect(options.cache).toBe('no-store');
    expect(options.method).toBe('POST');
    expect(options.mode).toBe('cors');
    expect(JSON.stringify(options)).not.toMatch(/diary|transcript|private-message|session-contents/);
  }
  expect(JSON.parse(anonymous[1].body)).toEqual({ action: 'list' });
  expect(anonymous[1].headers.Authorization).toBeUndefined();
  expect(JSON.parse(list[1].body)).toEqual({ action: 'list' });
  expect(list[1].headers.Authorization).toContain('Bearer ');
  expect(list[1].headers['X-Firebase-AppCheck']).toBe('limited-token-A');
  expect(replay[1].headers).toEqual(list[1].headers);
  expect(JSON.parse(noOpRevoke[1].body)).toEqual({
    action: 'revoke', grantId: 'qa-consent-probe-' + uuid
  });
  expect(noOpRevoke[1].headers['X-Firebase-AppCheck']).toBe('limited-token-B');
  expect(getLimitedUseToken).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.some(([,options]) =>
    JSON.parse(options.body)?.action === 'grant'
  )).toBe(false);
});

test('anonymous acceptance blocks all signed testing and no tokens are issued', async () => {
  fetch.mockReset().mockResolvedValue(response(200, { grants: [] }));
  await expect(auditStagingConsentEndpoint())
    .rejects.toThrow('consent-audit-unavailable');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(getLimitedUseToken).not.toHaveBeenCalled();
});

test('signed list denial returns safe code and does not attempt replay or revoke', async () => {
  fetch.mockReset()
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(response(403, { error: 'permission-denied' }));
  await expect(auditStagingConsentEndpoint()).rejects.toThrow('permission-denied');
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('malformed private list data fails closed and is not shown', async () => {
  fetch.mockReset()
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(response(200, { grants: [{ secret: 'PRIVATE' }] }));
  await expect(auditStagingConsentEndpoint())
    .rejects.toThrow('consent-audit-unavailable');
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('replay must be rejected; accepting it always fails', async () => {
  fetch.mockReset()
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(listed())
    .mockResolvedValueOnce(listed());
  await expect(auditStagingConsentEndpoint())
    .rejects.toThrow('consent-audit-unavailable');
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('a collision with existing grant forbids any attempt to revoke', async () => {
  fetch.mockReset()
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(listed([{
      grantId: 'qa-consent-probe-' + uuid,
      sourceId: 'synthetic-source', scope: 'session-turns',
      expiresAtMs: 1800000000000
    }]));
  await expect(auditStagingConsentEndpoint())
    .rejects.toThrow('consent-audit-unavailable');
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('revoke must be confirmed by the server, never inferred from HTTP only', async () => {
  fetch.mockReset()
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(listed())
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(response(200, { status: 'active' }));
  await expect(auditStagingConsentEndpoint())
    .rejects.toThrow('consent-audit-unavailable');
  expect(fetch).toHaveBeenCalledTimes(4);
});

test('account change before signed call fails without leaking tokens', async () => {
  getLimitedUseToken.mockReset().mockImplementation(async () => {
    auth.currentUser = { uid: 'another-account', getIdToken: vi.fn() };
    return { token: 'limited-token-A' };
  });
  await expect(auditStagingConsentEndpoint())
    .rejects.toThrow('unauthenticated');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('unknown private server error is masked from user', async () => {
  fetch.mockReset()
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(response(500, { error: 'DO_NOT_LEAK_SECRET' }));
  await expect(auditStagingConsentEndpoint())
    .rejects.toThrow('consent-audit-unavailable');
});
