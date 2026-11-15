/**
 * M3d.2a: signed, non-billable PREVIEW of consented turns from one saved session.
 * Intentionally no history send to Grok and no approval/dispatch endpoint.
 * The previous AI-01K preview remains disabled and independent.
 */
import { getLimitedUseToken } from 'firebase/app-check';
import { auth, appCheckClient, hostedAiEnabled, stagingAppCheckEnabled } from '../firebase/config';
import { contextConsentUiEnabled, CONTEXT_SCOPE } from './contextConsentService';
import { railwayAiRecoveryEnabled } from './reflectRailwayService';
import { contextLevelPolicy } from './contextLevels';

const requested = import.meta.env.VITE_ENABLE_REFLECT_SESSION_MEMORY_PREVIEW === 'true';
const origin = (import.meta.env.VITE_REFLECT_RAILWAY_AI_ORIGIN || '').trim();
const valid = contextConsentUiEnabled && railwayAiRecoveryEnabled &&
  !hostedAiEnabled && stagingAppCheckEnabled &&
  import.meta.env.VITE_AI_STAGING_PROJECT_ID === 'reflect-ai-staging' &&
  origin === 'https://reflect-ai-api-staging.up.railway.app';
export const sessionMemoryPreviewUiEnabled = requested && valid;
if (requested && !valid) {
  throw new Error('M3d preview requires isolated signed staging consent and recovery.');
}

const PATH = '/v1/ai/session-memory-preview';
const SOURCE = /^[A-Za-z0-9_-]{1,128}$/;
const GRANT = /^[A-Za-z0-9_-]{16,80}$/;
const REQUEST = /^[A-Za-z0-9_-]{12,80}$/;
const HASH = /^[a-f0-9]{64}$/;
const ALLOWED_ERRORS = Object.freeze([
  'invalid-argument', 'invalid-session-history', 'unauthenticated',
  'reauthentication-required', 'permission-denied', 'not-found',
  'resource-exhausted', 'unavailable'
]);
const fail = () => { throw new Error('preview-unavailable'); };

export function validateSessionMemoryPreview(data, sourceId, requestId, contextLevel) {
  const limits = contextLevel === undefined
    ? { maxTurns: 4, maxBytes: 1200 } : contextLevelPolicy(contextLevel);
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      data.sourceId !== sourceId || data.requestId !== requestId ||
      (contextLevel === undefined ? data.contextLevel !== undefined :
        data.contextLevel !== contextLevel) ||
      data.scope !== CONTEXT_SCOPE || data.providerDispatchAllowed !== false ||
      data.disclosureRequired !== true ||
      !HASH.test(data.approvalDigest || '') ||
      typeof data.truncated !== 'boolean' ||
      !Array.isArray(data.turns) ||
      data.turns.length < 1 || data.turns.length > limits.maxTurns ||
      !Number.isSafeInteger(data.totalBytes) ||
      data.totalBytes < 1 || data.totalBytes > limits.maxBytes) fail();
  const seen = new Set();
  let bytes = 0;
  const turns = data.turns.map(t => {
    if (!t || typeof t !== 'object' || Array.isArray(t) ||
        !SOURCE.test(t.sourceTurnId || '') || seen.has(t.sourceTurnId) ||
        !['user','assistant'].includes(t.role) ||
        typeof t.content !== 'string' || !t.content.trim() ||
        t.untrustedSource !== true ||
        typeof t.truncated !== 'boolean') fail();
    const size = new TextEncoder().encode(t.content).length;
    if (!size || size > 300) fail();
    bytes += size;
    seen.add(t.sourceTurnId);
    return Object.freeze({
      sourceTurnId: t.sourceTurnId,
      role: t.role, content: t.content, truncated: t.truncated
    });
  });
  if (bytes !== data.totalBytes) fail();
  return Object.freeze({
    sourceId, requestId,
    ...(contextLevel === undefined ? {} : { contextLevel }),
    turns: Object.freeze(turns),
    approvalDigest: data.approvalDigest,
    totalBytes: data.totalBytes, truncated: data.truncated,
    providerDispatchAllowed: false
  });
}

export async function requestSessionMemoryPreview({ grantId, sourceId, requestId, message, contextLevel }) {
  if (!sessionMemoryPreviewUiEnabled || !appCheckClient || !auth.currentUser) {
    throw new Error('preview-disabled');
  }
  if (!GRANT.test(grantId || '') || !SOURCE.test(sourceId || '') ||
      !REQUEST.test(requestId || '') ||
      typeof message !== 'string' || !message.trim() ||
      new TextEncoder().encode(message).length > 2000) {
    throw new Error('invalid-argument');
  }
  if (contextLevel !== undefined) contextLevelPolicy(contextLevel);
  const owner = auth.currentUser;
  let token, appCheck;
  try {
    [token, appCheck] = await Promise.all([
      owner.getIdToken(), getLimitedUseToken(appCheckClient)
    ]);
  } catch { throw new Error('unauthenticated'); }
  if (!token || !appCheck?.token || auth.currentUser?.uid !== owner.uid) {
    throw new Error('unauthenticated');
  }
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15000);
  try {
    const response = await fetch(origin + PATH, {
      method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        'X-Firebase-AppCheck': appCheck.token
      },
      body: JSON.stringify({
        grantId, sourceId, requestId, message, scope: CONTEXT_SCOPE,
        ...(contextLevel === undefined ? {} : { contextLevel })
      }), signal: abort.signal
    });
    const body = await response.json().catch(() => null);
    if (auth.currentUser?.uid !== owner.uid) throw new Error('unauthenticated');
    if (response.status !== 200) {
      throw new Error(ALLOWED_ERRORS.includes(body?.error) ?
        body.error : 'preview-unavailable');
    }
    return validateSessionMemoryPreview(body, sourceId, requestId, contextLevel);
  } catch (error) {
    if (ALLOWED_ERRORS.includes(error?.message) ||
        ['unauthenticated', 'preview-unavailable'].includes(error?.message)) throw error;
    throw new Error('preview-unavailable');
  } finally { clearTimeout(timer); }
}
