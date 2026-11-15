import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  attestation: vi.fn(), id: vi.fn(), owner: { uid: 'synthetic-eric' }
}));
vi.mock('firebase/app-check', () => ({
  getLimitedUseToken: (...args) => mocks.attestation(...args)
}));
vi.mock('../firebase/config', () => ({
  auth: { currentUser: mocks.owner }, appCheckClient: {},
  stagingAppCheckEnabled: true, hostedAiEnabled: false, aiFunctions: null
}));
vi.mock('./sessionMemoryPreviewService', () => ({
  sessionMemoryPreviewUiEnabled: true
}));
vi.mock('./reflectRailwayService', () => ({
  railwayAiRecoveryEnabled: true, railwayAiEnabled: true,
  getRailwayAnalysis: vi.fn()
}));

const input = {
  sessionId: 'synthetic-session', requestId: 'synthetic-request-123456',
  message: 'Это вымышленный вопрос.', grantId: 'grant-synthetic123456789',
  approvedDigest: 'a'.repeat(64), confirmed: true
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_ENABLE_REFLECT_SESSION_MEMORY_REPLY', 'true');
  vi.stubEnv('VITE_REFLECT_RAILWAY_AI_ORIGIN',
    'https://reflect-ai-api-staging.up.railway.app');
  vi.stubEnv('VITE_AI_STAGING_PROJECT_ID', 'reflect-ai-staging');
  mocks.owner.getIdToken = mocks.id;
  mocks.id.mockResolvedValue('id-token-synthetic');
  mocks.attestation.mockResolvedValue({ token: 'consumed-appcheck-synthetic' });
});
afterEach(() => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test('M3d3 client requires separate explicit history approval and exact payload', async () => {
  const { buildSessionMemoryReplyPayload } =
    await import('./sessionMemoryReplyService');
  const body = buildSessionMemoryReplyPayload(input);
  expect(Object.keys(body).sort()).toEqual([
    'requestId','message','consent','sessionId','sourceTurnId',
    'grantId','approvedDigest','externalHistoryApproved'
  ].sort());
  expect(body).toMatchObject({
    sessionId: input.sessionId,
    sourceTurnId: 'user-' + input.requestId,
    requestId: input.requestId, message: input.message,
    externalHistoryApproved: true,
    consent: { granted: true, scope: 'one-message', version: '2026-11-07' }
  });
  expect(body).not.toHaveProperty('chatHistory');
  expect(body).not.toHaveProperty('uid');
  expect(body).not.toHaveProperty('model');

  for (const changed of [
    { confirmed: false }, { requestId: 'bad' },
    { grantId: 'bad' }, { approvedDigest: 'bad' },
    { message: ' changed ' }, { sessionId: '../other' }
  ]) {
    expect(() => buildSessionMemoryReplyPayload({
      ...input, ...changed
    })).toThrow();
  }
});

test('M3d3 client performs exactly one signed POST, never retries or falls back', async () => {
  const { sendSessionMemoryReply } =
    await import('./sessionMemoryReplyService');
  const fetchMock = vi.fn().mockResolvedValue({
    status: 200,
    json: async () => ({
      text: 'Синтетический ответ', model: 'grok-4.3',
      persistedByServer: true, sourceTurnId: 'user-' + input.requestId,
      historyUsed: true, excerptCount: 2
    })
  });
  vi.stubGlobal('fetch', fetchMock);
  const answer = await sendSessionMemoryReply(input);
  expect(answer.response).toBe('Синтетический ответ');
  expect(answer.historyUsed).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('https://reflect-ai-api-staging.up.railway.app/v1/ai/session-memory-reply');
  expect(options.method).toBe('POST');
  expect(options.headers.Authorization).toBe('Bearer id-token-synthetic');
  expect(options.headers['X-Firebase-AppCheck']).toBe('consumed-appcheck-synthetic');
  expect(JSON.parse(options.body).sourceTurnId).toBe('user-' + input.requestId);
  expect(JSON.stringify(options.body)).not.toContain('synthetic-eric');
});

test('M3d3 ambiguous network failure never causes a second request', async () => {
  const { sendSessionMemoryReply } =
    await import('./sessionMemoryReplyService');
  const fetchMock = vi.fn().mockRejectedValue(new Error('upstream timeout PRIVATE'));
  vi.stubGlobal('fetch', fetchMock);
  await expect(sendSessionMemoryReply(input))
    .rejects.toThrow('history-result-unknown');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('M3d3 fake server result cannot claim success or duplicate a turn', async () => {
  const { sendSessionMemoryReply } =
    await import('./sessionMemoryReplyService');
  const fetchMock = vi.fn().mockResolvedValue({
    status: 200,
    json: async () => ({
      text: 'fake', model: 'grok-4.3', persistedByServer: true,
      sourceTurnId: 'user-other', historyUsed: true, excerptCount: 2
    })
  });
  vi.stubGlobal('fetch', fetchMock);
  await expect(sendSessionMemoryReply(input))
    .rejects.toThrow('history-result-unknown');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});


test('M3 tiers: exact one-shot payload carries level but no client transcript', async () => {
  const { buildSessionMemoryReplyPayload } =
    await import('./sessionMemoryReplyService');
  const tier = buildSessionMemoryReplyPayload({ ...input, contextLevel: 'deep' });
  expect(tier.contextLevel).toBe('deep');
  expect(tier).not.toHaveProperty('chatHistory');
  expect(tier).not.toHaveProperty('uid');
  expect(() => buildSessionMemoryReplyPayload({
    ...input, contextLevel: 'all-history'
  })).toThrow();
});


test('M5c v2 history response retains versioned evidence, no repeat or client source upgrade',async()=>{
  const { sendSessionMemoryReply } =
    await import('./sessionMemoryReplyService');
  const fetchMock=vi.fn().mockResolvedValue({
    status:200,
    json:async()=>({
      text:'Синтетический ответ v2',model:'grok-4.3',
      persistedByServer:true,sourceTurnId:'user-'+input.requestId,
      historyUsed:true,excerptCount:1,
      interaction:{
        version:'reflect.interaction.v2',stage:'synthesize',
        evidenceClaims:[{ quote:'Это вымышленный вопрос.',
          sourceRef:'current-message',sourceTurnId:'user-'+input.requestId }],
        evidenceSummary:{ confirmedSlots:[],disputedSlots:[],
          missingSlots:['situation','desiredResult','circumstances','constraints'],
          completeCount:0 }
      }
    })
  });
  vi.stubGlobal('fetch',fetchMock);
  const value=await sendSessionMemoryReply(input);
  expect(value.interaction.version).toBe('reflect.interaction.v2');
  expect(value.interaction.evidenceSummary.completeCount).toBe(0);
  expect(fetchMock).toHaveBeenCalledOnce();
});
