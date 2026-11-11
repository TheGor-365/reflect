import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('firebase/app-check', () => ({ getLimitedUseToken: vi.fn() }));
vi.mock('../firebase/config', () => ({
  auth: { currentUser: { uid: 'synthetic-owner',
    getIdToken: vi.fn(async () => 'synthetic-id-token-long-enough-for-route') } },
  appCheckClient: { synthetic: true }
}));
vi.mock('./contextConsentService', () => ({
  CONTEXT_SCOPE: 'session-turns', contextConsentUiEnabled: true
}));
vi.mock('./contextPreviewService', () => ({
  contextPreviewUiEnabled: true
}));

vi.stubEnv('VITE_ENABLE_REFLECT_PREVIEW_GATE5_QA', 'true');
const {
  GATE5_SESSION_ID, gate5PreviewQaUiEnabled, runGate5PreviewAudit
} = await import('./stagingPreviewGate5Audit');
const { auth } = await import('../firebase/config');
const { getLimitedUseToken } = await import('firebase/app-check');

const GRANT = 'synthetic-gate5-grant-000001';
const owner = () => ({ grantId: GRANT, sourceId: GATE5_SESSION_ID,
  ownerUid: 'synthetic-owner' });
const list = hasTarget => ({
  grants: hasTarget ? [{ grantId: GRANT, sourceId: GATE5_SESSION_ID,
    scope: 'session-turns', expiresAtMs: Date.now() + 60000 }] : []
});
const response = (status, body = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' }
});

let serial = 0;
beforeEach(() => {
  vi.clearAllMocks();
  serial = 0;
  auth.currentUser = { uid: 'synthetic-owner',
    getIdToken: vi.fn(async () => 'synthetic-id-token-long-enough-for-route') };
  getLimitedUseToken.mockImplementation(async () => ({
    token: 'synthetic-limited-use-attestation-' + ++serial
  }));
});

describe('AI-01K Gate 5 browser transport (no live tokens)', () => {
  test('isolated UI flag and exact synthetic scope', async () => {
    expect(gate5PreviewQaUiEnabled).toBe(true);
    globalThis.fetch = vi.fn();
    await expect(runGate5PreviewAudit({
      kind: 'replay', grantId: GRANT, sourceId: 'private-real-session',
      ownerUid: 'synthetic-owner'
    })).rejects.toThrow('qa-invalid-target');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('same headers and body reused precisely: 200 → 401', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(response(200, { turns: ['synthetic only'] }))
      .mockResolvedValueOnce(response(401, { error: 'unauthenticated' }));
    const r = await runGate5PreviewAudit({ kind: 'replay', ...owner() });
    expect(r).toEqual({ kind: 'replay', passed: true, statuses: [200, 401] });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [firstUrl, first] = fetch.mock.calls[0];
    const [secondUrl, second] = fetch.mock.calls[1];
    expect(firstUrl).toBe(secondUrl);
    expect(firstUrl).toMatch(/\/v1\/privacy\/context-preview$/);
    expect(first.headers).toEqual(second.headers);
    expect(first.body).toBe(second.body);
    expect(getLimitedUseToken).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(r)).not.toMatch(/synthetic-limited|synthetic-id|grant-000/);
  });

  test('cross-route uses same attestation for each pair, different for next pair', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, list(true)))
      .mockResolvedValueOnce(response(401));
    const r = await runGate5PreviewAudit({ kind: 'cross-route', ...owner() });
    expect(r).toEqual({ kind: 'cross-route', passed: true,
      statuses: [200, 401, 200, 401] });
    expect(fetch).toHaveBeenCalledTimes(4);
    const calls = fetch.mock.calls;
    expect(calls[0][0]).toMatch(/context-preview$/);
    expect(calls[1][0]).toMatch(/context-consent$/);
    expect(calls[2][0]).toMatch(/context-consent$/);
    expect(calls[3][0]).toMatch(/context-preview$/);
    expect(calls[0][1].headers['X-Firebase-AppCheck'])
      .toBe(calls[1][1].headers['X-Firebase-AppCheck']);
    expect(calls[2][1].headers['X-Firebase-AppCheck'])
      .toBe(calls[3][1].headers['X-Firebase-AppCheck']);
    expect(calls[0][1].headers['X-Firebase-AppCheck'])
      .not.toBe(calls[2][1].headers['X-Firebase-AppCheck']);
    expect(getLimitedUseToken).toHaveBeenCalledTimes(2);
  });

  test('revoke is explicit; authoritative list excludes ID; FRESH token returns 403', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(response(200, list(true)))
      .mockResolvedValueOnce(response(200, { status: 'revoked' }))
      .mockResolvedValueOnce(response(200, list(false)))
      .mockResolvedValueOnce(response(403, { error: 'permission-denied' }));
    const r = await runGate5PreviewAudit({ kind: 'revoke-deny', ...owner() });
    expect(r).toEqual({ kind: 'revoke-deny', passed: true,
      statuses: [200, 200, 200, 403] });
    const calls = fetch.mock.calls;
    expect(JSON.parse(calls[1][1].body)).toEqual({ action: 'revoke', grantId: GRANT });
    expect(JSON.parse(calls[3][1].body)).toEqual({
      grantId: GRANT, sourceId: GATE5_SESSION_ID, scope: 'session-turns'
    });
    expect(getLimitedUseToken).toHaveBeenCalledTimes(4);
    const checks = calls.map(c => c[1].headers['X-Firebase-AppCheck']);
    expect(new Set(checks).size).toBe(4);
  });

  test('absent/expired synthetic grant blocks revoke and direct Preview', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response(200, list(false)));
    const r = await runGate5PreviewAudit({ kind: 'revoke-deny', ...owner() });
    expect(r.passed).toBe(false);
    expect(r.statuses).toEqual([200]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('unexpected HTTP 200 replay cannot be treated as a pass', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response(200));
    const r = await runGate5PreviewAudit({ kind: 'replay', ...owner() });
    expect(r.passed).toBe(false);
    expect(r.statuses).toEqual([200, 200]);
  });

  test('Preview OFF 404 stops before reusing token or mutating data', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response(404));
    const r = await runGate5PreviewAudit({ kind: 'cross-route', ...owner() });
    expect(r.passed).toBe(false);
    expect(r.statuses).toEqual([404]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('401 caused by reused token does not prove post-revoke denial', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(response(200, list(true)))
      .mockResolvedValueOnce(response(200, { status: 'revoked' }))
      .mockResolvedValueOnce(response(200, list(false)))
      .mockResolvedValueOnce(response(401));
    const r = await runGate5PreviewAudit({ kind: 'revoke-deny', ...owner() });
    expect(r.passed).toBe(false);
    expect(r.statuses).toEqual([200, 200, 200, 401]);
  });

  test('switching authenticated account rejects pending results', async () => {
    globalThis.fetch = vi.fn(async () => {
      auth.currentUser = { uid: 'other-owner' };
      return response(200);
    });
    await expect(runGate5PreviewAudit({ kind: 'replay', ...owner() }))
      .rejects.toThrow('qa-transport-error');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('abort / timeout fails closed with no next request', async () => {
    const controller = new AbortController();
    globalThis.fetch = vi.fn(async () => {
      controller.abort();
      throw new Error('synthetic network timeout');
    });
    await expect(runGate5PreviewAudit({
      kind: 'replay', ...owner(), signal: controller.signal
    })).rejects.toThrow('qa-transport-error');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
