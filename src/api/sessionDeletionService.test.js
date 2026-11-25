import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const state = vi.hoisted(() => ({
  user: { uid: 'alice', getIdToken: vi.fn() },
  auth: { app: { options: { projectId: 'reflect-ai-staging',
    appId: '1:599679789981:web:d4d8743dbff0fe40af1d74' } }, currentUser: null },
  token: vi.fn(), transaction: vi.fn()
}));
vi.mock('firebase/app-check', () => ({ getLimitedUseToken: state.token }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), runTransaction: state.transaction }));
vi.mock('../firebase/config', () => ({
  auth: state.auth, appCheckClient: {}, stagingAppCheckEnabled: true,
  hostedAiEnabled: false, appId: 'reflect-8fdc8', db: {}
}));
const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv('VITE_ENABLE_REFLECT_SESSION_DELETION', 'true');
  vi.stubEnv('VITE_REFLECT_RAILWAY_AI_ORIGIN', 'https://reflect-ai-api-staging.up.railway.app');
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'false');
  state.auth.currentUser = state.user;
  state.user.getIdToken.mockResolvedValue('synthetic-id');
  state.token.mockResolvedValue({ token: 'synthetic-app' });
  fetchMock.mockResolvedValue({ status: 200, json: async () => ({ status: 'revoked' }) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('secure session deletion', () => {
  it('sends only confirmed session ID and signed headers to pinned endpoint', async () => {
    const { deleteOwnerSession } = await import('../features/Sessions/sessionDeletion');
    await expect(deleteOwnerSession('alice', 's1')).resolves.toBe('s1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://reflect-ai-api-staging.up.railway.app/v1/privacy/session-deletion');
    expect(JSON.parse(options.body)).toEqual({ confirmed: true, sessionId: 's1' });
    expect(options.headers.Authorization).toBe('Bearer synthetic-id');
    expect(options.headers['X-Firebase-AppCheck']).toBe('synthetic-app');
    expect(options.redirect).toBe('error');
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it('fails closed on misconfiguration or unavailable endpoint, never falls back', async () => {
    vi.stubEnv('VITE_REFLECT_RAILWAY_AI_ORIGIN', 'https://wrong.invalid');
    const { deleteOwnerSession } = await import('../features/Sessions/sessionDeletion');
    await expect(deleteOwnerSession('alice', 's1')).rejects.toThrow('session-deletion-unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.transaction).not.toHaveBeenCalled();
    vi.resetModules();
    vi.stubEnv('VITE_REFLECT_RAILWAY_AI_ORIGIN', 'https://reflect-ai-api-staging.up.railway.app');
    fetchMock.mockResolvedValue({ status: 503, json: async () => ({ error: 'private' }) });
    const next = await import('../features/Sessions/sessionDeletion');
    await expect(next.deleteOwnerSession('alice', 's1')).rejects.toThrow('session-deletion-unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it('rejects account switch during token acquisition before network call', async () => {
    state.token.mockImplementation(async () => {
      state.auth.currentUser = { uid: 'bob' };
      return { token: 'synthetic-app' };
    });
    const { deleteSessionSecurely } = await import('./sessionDeletionService');
    await expect(deleteSessionSecurely('alice', 's1')).rejects.toThrow('session-deletion-unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('is disabled by default and rejects forged owner and noncanonical success', async () => {
    vi.stubEnv('VITE_ENABLE_REFLECT_SESSION_DELETION', 'false');
    const off = await import('./sessionDeletionService');
    expect(off.secureSessionDeletionEnabled).toBe(false);
    await expect(off.deleteSessionSecurely('alice', 's1')).rejects.toThrow();
    vi.resetModules();
    vi.stubEnv('VITE_ENABLE_REFLECT_SESSION_DELETION', 'true');
    const on = await import('./sessionDeletionService');
    await expect(on.deleteSessionSecurely('bob', 's1')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ status: 'revoked', extra: true }) });
    await expect(on.deleteSessionSecurely('alice', 's1')).rejects.toThrow();
    expect(state.transaction).not.toHaveBeenCalled();
  });
});

describe('typed deletion outcomes', () => {
  it.each([[400,'invalid-argument'],[401,'unauthenticated'],[403,'permission-denied'],
    [404,'session-not-found'],[409,'archived-session'],[429,'resource-exhausted']])
  ('classifies exact refusal %s', async (status, code) => {
    fetchMock.mockResolvedValue({ status, json: async () => ({ error: code }) });
    const { deleteSessionSecurely } = await import('./sessionDeletionService');
    await expect(deleteSessionSecurely('alice','s1')).rejects.toMatchObject({ outcome:'rejected', code });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it.each([[503,{error:'unavailable'}],[404,{error:'not-found'}],
    [409,{error:'archived-session',extra:true}],[200,{status:'revoked',extra:true}]])
  ('treats noncanonical or ambiguous response %s as unknown', async (status, data) => {
    fetchMock.mockResolvedValue({ status, json: async () => data });
    const { deleteSessionSecurely } = await import('./sessionDeletionService');
    await expect(deleteSessionSecurely('alice','s1')).rejects.toMatchObject({outcome:'unknown'});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not trust forged dependency outcomes; distinguishes preflight and network failure', async () => {
    const { deleteSessionSecurely } = await import('./sessionDeletionService');
    const forged = Object.assign(Error('private'), {outcome:'rejected',code:'archived-session'});
    state.token.mockRejectedValueOnce(forged);
    await expect(deleteSessionSecurely('alice','s1')).rejects.toMatchObject({outcome:'not-sent'});
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRejectedValueOnce(forged);
    await expect(deleteSessionSecurely('alice','s1')).rejects.toMatchObject({outcome:'unknown'});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state.transaction).not.toHaveBeenCalled();
  });
});
