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
vi.mock('firebase/app-check', () => ({
  getLimitedUseToken: mocks.appCheckToken
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('VITE_ENABLE_REFLECT_RAILWAY_AI', 'false');
  vi.stubEnv('VITE_ENABLE_REFLECT_RAILWAY_PRECHECK', 'true');
  vi.stubEnv(
    'VITE_REFLECT_RAILWAY_AI_ORIGIN',
    'https://reflect-ai-api-staging.up.railway.app'
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('staging precheck sends an empty body with genuine signed tokens, never user content', async () => {
  const fetchMock = vi.fn(async () => ({
    status: 503,
    json: async () => ({ error: 'provider-disabled' })
  }));
  vi.stubGlobal('fetch', fetchMock);
  const { checkRailwayAttestation, railwayPrecheckEnabled, railwayAiEnabled } =
    await import('./reflectRailwayService');
  expect(railwayPrecheckEnabled).toBe(true);
  expect(railwayAiEnabled).toBe(false);
  await expect(checkRailwayAttestation()).resolves.toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe('https://reflect-ai-api-staging.up.railway.app/v1/ai/reply');
  expect(request.method).toBe('POST');
  expect(request.body).toBe('{}');
  expect(request.credentials).toBe('omit');
  expect(request.headers.Authorization).toBe('Bearer signed-firebase-id-token');
  expect(request.headers['X-Firebase-AppCheck']).toBe('single-use-signed-appcheck-token');
  expect(JSON.stringify(request)).not.toMatch(/diary|profile|sessionHistory|secretKey/i);
});

test('only exact provider-disabled after valid signed verification is accepted', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    status: 401, json: async () => ({ error: 'unauthenticated' })
  })));
  const { checkRailwayAttestation } = await import('./reflectRailwayService');
  await expect(checkRailwayAttestation()).rejects.toThrow('attestation-failed');
});

test('precheck fails closed for a different Railway domain', async () => {
  vi.stubEnv('VITE_REFLECT_RAILWAY_AI_ORIGIN', 'https://other-railway-app.up.railway.app');
  await expect(import('./reflectRailwayService')).rejects.toThrow(
    'Railway AI requires the isolated signed staging configuration.'
  );
});
