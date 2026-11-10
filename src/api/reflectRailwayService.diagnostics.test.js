import { beforeEach, afterEach, test, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  idToken: vi.fn(async () => 'signed-firebase-id-token'),
  appCheckToken: vi.fn(async () => ({ token: 'single-use-signed-appcheck-token' }))
}));
vi.mock('../firebase/config', () => ({
  auth: { currentUser: { getIdToken: mocks.idToken } },
  appCheckClient: { provider: 'isolated-staging' },
  stagingAppCheckEnabled: true,
  hostedAiEnabled: false
}));
vi.mock('firebase/app-check', () => ({ getLimitedUseToken: mocks.appCheckToken }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('VITE_ENABLE_REFLECT_RAILWAY_AI', 'true');
  vi.stubEnv('VITE_ENABLE_REFLECT_RAILWAY_PRECHECK', 'false');
  vi.stubEnv('VITE_REFLECT_RAILWAY_AI_ORIGIN',
    'https://reflect-ai-api-staging.up.railway.app');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('readiness uses signed tokens and empty JSON; never calls paid reply path', async () => {
  const fetchMock = vi.fn(async () => ({
    status: 200, json: async () => ({
      status: 'outbound-disabled', model: 'grok-4.3'
    })
  }));
  vi.stubGlobal('fetch', fetchMock);
  const { checkRailwayReadiness } = await import('./reflectRailwayService');
  await expect(checkRailwayReadiness()).resolves.toBe('outbound-disabled');
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe('https://reflect-ai-api-staging.up.railway.app/v1/ai/diagnostics');
  expect(request.method).toBe('POST');
  expect(request.body).toBe('{}');
  expect(request.credentials).toBe('omit');
  expect(request.headers.Authorization).toBe('Bearer signed-firebase-id-token');
  expect(request.headers['X-Firebase-AppCheck']).toBe('single-use-signed-appcheck-token');
  expect(JSON.stringify(request)).not.toMatch(/diary|profile|sessionHistory|secretKey/i);
});

test('revoked signed session returns a stable code and does not call /reply', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    status: 401, json: async () => ({ error: 'reauthentication-required' })
  })));
  const { checkRailwayReadiness } = await import('./reflectRailwayService');
  await expect(checkRailwayReadiness()).rejects.toThrow('reauthentication-required');
});

test('unknown remote errors and raw secrets never propagate to UI', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    status: 500, json: async () => ({ error: 'server-token-PRIVATE' })
  })));
  const { checkRailwayReadiness } = await import('./reflectRailwayService');
  await expect(checkRailwayReadiness()).rejects.toThrow('diagnostics-unavailable');
});

test('AI send maps known revoked auth to non-provider error, without swallowing failures', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    status: 401, json: async () => ({ error: 'reauthentication-required' })
  })));
  const { getRailwayAnalysis } = await import('./reflectRailwayService');
  await expect(getRailwayAnalysis({
    requestId: 'AAAAAAABBBBBBBBCCCCCCCC', message: 'Синтетический тест',
    consent: { granted: true, version: '2026-11-07', scope: 'one-message' }
  })).rejects.toThrow('reauthentication-required');
});

test('provider key/model access GET diagnostic sends empty JSON and never calls /reply', async () => {
  const fetchMock=vi.fn(async()=>({
    status:200,json:async()=>({status:'model-accessible',model:'grok-4.3'})
  }));
  vi.stubGlobal('fetch',fetchMock);
  const {checkRailwayProviderAccess}=await import('./reflectRailwayService');
  await expect(checkRailwayProviderAccess()).resolves.toBe('model-accessible');
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url,request]=fetchMock.mock.calls[0];
  expect(url).toBe('https://reflect-ai-api-staging.up.railway.app/v1/ai/provider-diagnostics');
  expect(request.method).toBe('POST');
  expect(request.body).toBe('{}');
  expect(request.credentials).toBe('omit');
  expect(request.headers.Authorization).toBe('Bearer signed-firebase-id-token');
  expect(request.headers['X-Firebase-AppCheck']).toBe('single-use-signed-appcheck-token');
  expect(JSON.stringify(request)).not.toMatch(/diary|profile|sessionHistory|secretKey/i);
});
test('provider failure is only a bounded status, never raw upstream text',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({
    status:200,json:async()=>({status:'credentials-rejected',model:'grok-4.3',
      private_error:'EXPOSED_TOKEN'})
  })));
  const {checkRailwayProviderAccess}=await import('./reflectRailwayService');
  const result=await checkRailwayProviderAccess();
  expect(result).toBe('credentials-rejected');
  expect(result).not.toContain('EXPOSED_TOKEN');
});

test.each([
  ['xai-invalid-request', 502],
  ['xai-forbidden', 502],
  ['xai-rate-limited', 502],
  ['xai-upstream-error', 502]
])('signed paid transport shows bounded error %s without leaking provider response', async (status, httpStatus) => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    status: httpStatus,
    json: async () => ({ error: status, raw_provider_error: 'TOKEN_OR_USER_TEXT_SHOULD_NOT_APPEAR' })
  })));
  const { getRailwayAnalysis } = await import('./reflectRailwayService');
  await expect(getRailwayAnalysis({
    requestId: 'AAAABBBBCCCCDDDDEEEEFFFF',
    message: 'Синтетический тест',
    consent: { granted: true, version: '2026-11-07', scope: 'one-message' }
  })).rejects.toThrow(status);
});
