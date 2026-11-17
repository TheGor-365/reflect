import { beforeEach, afterEach, test, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  idToken: vi.fn(async () => 'firebase-owner-id-token'),
  appCheckToken: vi.fn(async () => ({ token: 'consumable-app-check-token' }))
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
  vi.stubEnv('VITE_ENABLE_REFLECT_AI_RECOVERY', 'true');
  vi.stubEnv('VITE_REFLECT_RAILWAY_AI_ORIGIN',
    'https://reflect-ai-api-staging.up.railway.app');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ownerTurn = {
  requestId: 'request-1234567890123456',
  message: 'Сохранённая реплика пользователя',
  consent: { granted: true, version: '2026-11-07', scope: 'one-message' },
  sessionId: 'session-eric-123',
  sourceTurnId: 'user-1234567890123456789',
  retryConfirmed: true
};

test('R8 recovery mode uses the new signed server-persisted route once; never legacy /reply', async () => {
  const fetchMock = vi.fn(async () => ({
    status: 200,
    json: async () => ({
      text: 'Синтетический ответ', model: 'grok-4.3',
      persistedByServer: true, sourceTurnId: ownerTurn.sourceTurnId
    })
  }));
  vi.stubGlobal('fetch', fetchMock);
  const { getRailwayAnalysis, railwayAiRecoveryEnabled } =
    await import('./reflectRailwayService');
  expect(railwayAiRecoveryEnabled).toBe(true);
  const result = await getRailwayAnalysis(ownerTurn);
  expect(result.persistedByServer).toBe(true);
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('https://reflect-ai-api-staging.up.railway.app/v1/ai/reply-recovery');
  expect(options.method).toBe('POST');
  expect(options.credentials).toBe('omit');
  expect(options.headers.Authorization).toBe('Bearer firebase-owner-id-token');
  expect(options.headers['X-Firebase-AppCheck']).toBe('consumable-app-check-token');
  expect(JSON.parse(options.body)).toEqual(ownerTurn);
  expect(options.body).not.toMatch(/chatHistory|diary|profile|secretKey/);
});

test('R7 without recovery flag keeps unchanged legacy endpoint and payload', async () => {
  vi.stubEnv('VITE_ENABLE_REFLECT_AI_RECOVERY', 'false');
  const fetchMock = vi.fn(async () => ({
    status: 200, json: async () => ({ text: 'Legacy synthetic', model: 'grok-4.3' })
  }));
  vi.stubGlobal('fetch', fetchMock);
  const { getRailwayAnalysis, railwayAiRecoveryEnabled } =
    await import('./reflectRailwayService');
  expect(railwayAiRecoveryEnabled).toBe(false);
  await getRailwayAnalysis({ requestId: ownerTurn.requestId,
    message: ownerTurn.message, consent: ownerTurn.consent });
  expect(fetchMock.mock.calls[0][0])
    .toBe('https://reflect-ai-api-staging.up.railway.app/v1/ai/reply');
});

test('R8 new route never silently retries a rejected or unknown paid attempt', async () => {
  const fetchMock = vi.fn(async () => ({
    status: 409, json: async () => ({ error: 'already-exists' })
  }));
  vi.stubGlobal('fetch', fetchMock);
  const { getRailwayAnalysis } = await import('./reflectRailwayService');
  await expect(getRailwayAnalysis(ownerTurn)).rejects.toThrow('ai-request-not-completed');
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls[0][0]).toContain('/v1/ai/reply-recovery');
});

test('signed free attempt-status is isolated from any reply generation path', async () => {
  const fetchMock = vi.fn(async () => ({
    status: 200, json: async () => ({
      status: 'not_tracked', billedPossible: true, canRetry: true,
      sessionId: ownerTurn.sessionId, sourceTurnId: ownerTurn.sourceTurnId
    })
  }));
  vi.stubGlobal('fetch', fetchMock);
  const { readRailwayTurnStatus } = await import('./reflectRailwayService');
  const status = await readRailwayTurnStatus(
    ownerTurn.sessionId, ownerTurn.sourceTurnId
  );
  expect(status.status).toBe('not_tracked');
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toContain('/v1/ai/attempt-status');
  expect(JSON.parse(options.body)).toEqual({
    sessionId: ownerTurn.sessionId, sourceTurnId: ownerTurn.sourceTurnId
  });
  expect(options.body).not.toContain(ownerTurn.message);
});
