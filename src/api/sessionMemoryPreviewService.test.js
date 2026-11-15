import { validateSessionMemoryPreview, requestSessionMemoryPreview,
  sessionMemoryPreviewUiEnabled } from './sessionMemoryPreviewService';
import { CONTEXT_SCOPE } from './contextConsentService';

vi.mock('firebase/app-check', () => ({ getLimitedUseToken: vi.fn() }));
vi.mock('../firebase/config', () => ({
  auth: { currentUser: null }, appCheckClient: null,
  stagingAppCheckEnabled: false, hostedAiEnabled: false
}));
vi.mock('./contextConsentService', () => ({
  contextConsentUiEnabled: false, CONTEXT_SCOPE: 'session-turns'
}));
vi.mock('./reflectRailwayService', () => ({
  railwayAiRecoveryEnabled: false
}));

const text = 'Это вымышленная ситуация.';
const sourceId = 'session-123';
const requestId = 'request-123456789000';
const base = {
  sourceId, requestId, scope: CONTEXT_SCOPE,
  providerDispatchAllowed: false, disclosureRequired: true,
  approvalDigest: 'a'.repeat(64), truncated: false,
  turns: [{
    sourceTurnId: 'user-first-123', role: 'user',
    content: text, truncated: false, untrustedSource: true
  }],
  totalBytes: new TextEncoder().encode(text).length
};

test('default-off browser memory preview never sends a network request', async () => {
  expect(sessionMemoryPreviewUiEnabled).toBe(false);
  await expect(requestSessionMemoryPreview({
    sourceId, requestId, grantId: 'grant-12345678900000',
    message: 'Hello'
  })).rejects.toThrow('preview-disabled');
});

test('strict preview validates sources, digest, role, exact byte sum, and strips internals', () => {
  const result = validateSessionMemoryPreview({
    ...base, uid: 'not-to-return', grantId: 'hidden'
  }, sourceId, requestId);
  expect(result.providerDispatchAllowed).toBe(false);
  expect(result).not.toHaveProperty('uid');
  expect(result).not.toHaveProperty('grantId');
  expect(result.turns[0]).not.toHaveProperty('untrustedSource');
  expect(result.turns[0].content).toBe(text);
});

test('mismatched binding and forged approval are rejected', () => {
  for (const value of [
    { ...base, requestId: 'different-id' },
    { ...base, sourceId: 'another-session' },
    { ...base, providerDispatchAllowed: true },
    { ...base, approvalDigest: 'not-digest' },
    { ...base, totalBytes: base.totalBytes - 1 },
    { ...base, turns: [{ ...base.turns[0], role: 'system' }] },
    { ...base, turns: [base.turns[0], base.turns[0]],
      totalBytes: base.totalBytes * 2 },
    { ...base, turns: [{ ...base.turns[0], content: 'X'.repeat(301) }],
      totalBytes: 301 }
  ]) expect(() => validateSessionMemoryPreview(
    value, sourceId, requestId
  )).toThrow('preview-unavailable');
});


test('context level reply is bound and cannot exceed server-published tier limits', () => {
  const limited = validateSessionMemoryPreview({
    ...base, contextLevel: 'optimal'
  }, sourceId, requestId, 'optimal');
  expect(limited.contextLevel).toBe('optimal');
  expect(() => validateSessionMemoryPreview({
    ...base, contextLevel: 'deep'
  }, sourceId, requestId, 'optimal')).toThrow('preview-unavailable');
  const six = Array.from({ length: 6 }, (_, i) => ({
    ...base.turns[0], sourceTurnId: 'user-t' + i,
    content: 'A'.repeat(100)
  }));
  const deep = validateSessionMemoryPreview({
    ...base, contextLevel: 'deep',
    turns: six, totalBytes: 600
  }, sourceId, requestId, 'deep');
  expect(deep.turns.length).toBe(6);
  expect(() => validateSessionMemoryPreview({
    ...base, contextLevel: 'optimal',
    turns: six, totalBytes: 600
  }, sourceId, requestId, 'optimal')).toThrow('preview-unavailable');
});
