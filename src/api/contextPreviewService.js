/**
 * AI-01K: isolated, explicitly requested owner context preview ONLY.
 * No provider request, no persistence and no automatic consent creation.
 */
import { getLimitedUseToken } from 'firebase/app-check';
import { auth, appCheckClient, hostedAiEnabled, stagingAppCheckEnabled } from '../firebase/config';
import { contextConsentUiEnabled, CONTEXT_SCOPE } from './contextConsentService';

const requested = import.meta.env.VITE_ENABLE_REFLECT_CONTEXT_PREVIEW === 'true';
const origin = (import.meta.env.VITE_REFLECT_RAILWAY_AI_ORIGIN || '').trim();
const valid = contextConsentUiEnabled &&
  !hostedAiEnabled && stagingAppCheckEnabled &&
  import.meta.env.VITE_AI_STAGING_PROJECT_ID === 'reflect-ai-staging' &&
  origin === 'https://reflect-ai-api-staging.up.railway.app';
export const contextPreviewUiEnabled = requested && valid;
if (requested && !valid) throw new Error('Context preview requires isolated signed staging consent.');

const allowed = Object.freeze([
  'invalid-argument', 'unauthenticated', 'reauthentication-required',
  'permission-denied', 'not-found', 'resource-exhausted', 'unavailable',
  'invalid-session-history', 'invalid-preview-quota'
]);
const PREVIEW_PATH = '/v1/privacy/context-preview';
const ID = /^[A-Za-z0-9_-]{16,80}$/;
const SOURCE = /^[A-Za-z0-9_-]{1,128}$/;
const HASH = /^[a-f0-9]{64}$/;
const safeFail = () => { throw new Error('preview-unavailable'); };

function validatePreview(result, requestedSource) {
  if (!result || typeof result !== 'object' || Array.isArray(result) ||
      result.sourceId !== requestedSource || result.scope !== CONTEXT_SCOPE ||
      result.disclosureRequired !== true ||
      result.providerDispatchAllowed !== false ||
      !HASH.test(result.previewHash || '') ||
      !Array.isArray(result.turns) || result.turns.length < 1 ||
      result.turns.length > 4 ||
      !Number.isSafeInteger(result.totalBytes) ||
      result.totalBytes < 1 || result.totalBytes > 2400 ||
      !Number.isSafeInteger(result.sourceTurnCount) ||
      result.sourceTurnCount < result.turns.length ||
      typeof result.truncated !== 'boolean') safeFail();

  const encoder = new TextEncoder();
  let bytes = 0;
  for (const t of result.turns) {
    if (!t || typeof t !== 'object' || Array.isArray(t) ||
        !['user', 'assistant'].includes(t.role) ||
        typeof t.content !== 'string' ||
        !t.content.trim() || t.untrustedSource !== true ||
        typeof t.truncated !== 'boolean') safeFail();
    const size = encoder.encode(t.content).length;
    if (size > 700 || size < 1) safeFail();
    bytes += size;
  }
  if (bytes !== result.totalBytes) safeFail();

  return Object.freeze({
    sourceId: result.sourceId,
    scope: result.scope,
    previewHash: result.previewHash,
    turns: result.turns.map(t => Object.freeze({
      role: t.role, content: t.content, truncated: t.truncated
    })),
    totalBytes: result.totalBytes, sourceTurnCount: result.sourceTurnCount,
    truncated: result.truncated
  });
}

export async function requestContextPreview({ grantId, sourceId, scope }) {
  if (!contextPreviewUiEnabled || !appCheckClient || !auth.currentUser) {
    throw new Error('preview-disabled');
  }
  if (typeof grantId !== 'string' || !ID.test(grantId) ||
      typeof sourceId !== 'string' || !SOURCE.test(sourceId) ||
      scope !== CONTEXT_SCOPE) throw new Error('invalid-argument');

  const principal = auth.currentUser;
  let token, attestation;
  try {
    [token, attestation] = await Promise.all([
      principal.getIdToken(),
      getLimitedUseToken(appCheckClient)
    ]);
  } catch { throw new Error('unauthenticated'); }
  if (!token || !attestation?.token ||
      auth.currentUser?.uid !== principal.uid) throw new Error('unauthenticated');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(origin + PREVIEW_PATH, {
      method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        'X-Firebase-AppCheck': attestation.token
      },
      body: JSON.stringify({ grantId, sourceId, scope }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => null);
    if (auth.currentUser?.uid !== principal.uid) throw new Error('unauthenticated');
    if (response.status !== 200) throw new Error(
      allowed.includes(data?.error) ? data.error : 'preview-unavailable'
    );
    return validatePreview(data, sourceId);
  } catch (error) {
    if (allowed.includes(error?.message) ||
        ['preview-unavailable', 'unauthenticated'].includes(error?.message)) throw error;
    throw new Error('preview-unavailable');
  } finally {
    clearTimeout(timeout);
  }
}
