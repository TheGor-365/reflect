/**
 * M3d.3 — one explicit, potentially billable history-assisted turn.
 * Independent from the existing one-message transport. No automatic fallback
 * or retry. All excerpts are re-read by the trusted Railway server; the
 * browser submits only a digest and a one-use, explicitly confirmed intent.
 */
import { getLimitedUseToken } from 'firebase/app-check';
import {
  auth, appCheckClient, hostedAiEnabled, stagingAppCheckEnabled
} from '../firebase/config';
import { sessionMemoryPreviewUiEnabled } from './sessionMemoryPreviewService';
import { railwayAiRecoveryEnabled } from './reflectRailwayService';
import { createRequestBody } from './reflectAssistantService';

const requested = import.meta.env.VITE_ENABLE_REFLECT_SESSION_MEMORY_REPLY === 'true';
const origin = (import.meta.env.VITE_REFLECT_RAILWAY_AI_ORIGIN || '').trim();
const safe = sessionMemoryPreviewUiEnabled && railwayAiRecoveryEnabled &&
  !hostedAiEnabled && stagingAppCheckEnabled &&
  import.meta.env.VITE_AI_STAGING_PROJECT_ID === 'reflect-ai-staging' &&
  origin === 'https://reflect-ai-api-staging.up.railway.app';
export const sessionMemoryReplyUiEnabled = requested && safe;
if (requested && !safe) {
  throw new Error('M3d paid history send requires approved signed staging preview and recovery.');
}

const RESOURCE = /^[A-Za-z0-9_-]{1,128}$/;
const REQUEST = /^[A-Za-z0-9_-]{12,80}$/;
const GRANT = /^[A-Za-z0-9_-]{16,80}$/;
const HASH = /^[a-f0-9]{64}$/;
const SAFE_ERRORS = Object.freeze([
  'invalid-argument', 'invalid-session-history', 'unauthenticated',
  'reauthentication-required', 'permission-denied', 'not-found',
  'already-exists', 'resource-exhausted', 'unavailable',
  'xai-invalid-request', 'xai-unauthorized', 'xai-forbidden',
  'xai-endpoint-not-found', 'xai-upstream-timeout', 'xai-request-too-large',
  'xai-rate-limited', 'xai-upstream-error', 'xai-unavailable',
  'invalid-provider-response'
]);

export function buildSessionMemoryReplyPayload({
  sessionId, requestId, message, grantId, approvedDigest, confirmed
}) {
  if (!sessionMemoryReplyUiEnabled || confirmed !== true ||
      !RESOURCE.test(sessionId || '') || !REQUEST.test(requestId || '') ||
      !GRANT.test(grantId || '') || !HASH.test(approvedDigest || '') ||
      typeof message !== 'string' || !message.trim() ||
      message !== message.trim()) {
    throw new Error('history-send-disabled');
  }
  // Existing producer owns exact one-message consent + durable turn IDs.
  // Its recovery mode MUST be enabled; never inject UID or client excerpts.
  const sourceTurnId = 'user-' + requestId;
  const base = createRequestBody(message, requestId, { sessionId, sourceTurnId });
  if (base.sessionId !== sessionId || base.sourceTurnId !== sourceTurnId ||
      base.retryConfirmed !== undefined) throw new Error('history-send-disabled');
  return Object.freeze({
    ...base, grantId, approvedDigest, externalHistoryApproved: true
  });
}

export async function sendSessionMemoryReply({ sessionId, requestId,
  message, grantId, approvedDigest, confirmed
}) {
  const payload = buildSessionMemoryReplyPayload({
    sessionId, requestId, message, grantId, approvedDigest, confirmed
  });
  if (!appCheckClient || !auth.currentUser) throw new Error('unauthenticated');
  const principal = auth.currentUser;
  let token, attestation;
  try {
    [token, attestation] = await Promise.all([
      principal.getIdToken(), getLimitedUseToken(appCheckClient)
    ]);
  } catch { throw new Error('unauthenticated'); }
  if (!token || !attestation?.token ||
      auth.currentUser?.uid !== principal.uid) throw new Error('unauthenticated');

  // Network outcome is ambiguous after dispatch. Never resubmit here, even
  // after an HTTP error, timeout, parse error or a page refresh.
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 44000);
  try {
    const response = await fetch(origin + '/v1/ai/session-memory-reply', {
      method: 'POST', mode: 'cors', cache: 'no-store', credentials: 'omit',
      headers: {
        'Content-Type': 'application/json', Authorization: 'Bearer ' + token,
        'X-Firebase-AppCheck': attestation.token
      },
      body: JSON.stringify(payload), signal: abort.signal
    });
    const data = await response.json().catch(() => null);
    if (auth.currentUser?.uid !== principal.uid) {
      throw new Error('history-result-unknown');
    }
    if (response.status !== 200) {
      throw new Error(SAFE_ERRORS.includes(data?.error) ?
        data.error : 'history-result-unknown');
    }
    if (!data || data.model !== 'grok-4.3' ||
        data.persistedByServer !== true ||
        data.sourceTurnId !== payload.sourceTurnId ||
        data.historyUsed !== true ||
        !Number.isSafeInteger(data.excerptCount) ||
        data.excerptCount < 1 || data.excerptCount > 4 ||
        typeof data.text !== 'string' ||
        !data.text.trim() || data.text.length > 2400) {
      throw new Error('history-result-unknown');
    }
    return Object.freeze({
      response: data.text.trim(), sourceTurnId: data.sourceTurnId,
      persistedByServer: true, historyUsed: true,
      excerptCount: data.excerptCount,
      interaction: data.interaction?.version === 'reflect.interaction.v1'
        ? data.interaction : null
    });
  } catch (error) {
    if (SAFE_ERRORS.includes(error?.message) ||
        error?.message === 'history-result-unknown') throw error;
    throw new Error('history-result-unknown');
  } finally { clearTimeout(timeout); }
}
