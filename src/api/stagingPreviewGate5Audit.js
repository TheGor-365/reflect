/**
 * AI-01K Gate 5: explicit staging-only, owner-signed, status-only browser QA.
 * The private Firebase/Auth/App Check credentials never leave this module
 * except as headers of the intended Railway HTTPS requests. No logs, storage,
 * provider calls, auto-created grants, or transcript parsing.
 */
import { getLimitedUseToken } from 'firebase/app-check';
import { auth, appCheckClient } from '../firebase/config';
import { CONTEXT_SCOPE, contextConsentUiEnabled } from './contextConsentService';
import { contextPreviewUiEnabled } from './contextPreviewService';

export const GATE5_SESSION_ID = 'ai01k_gate4_synthetic_20261111';
export const GATE5_SESSION_TITLE = 'AI-01K Gate 4 Synthetic QA';
export const gate5PreviewQaUiEnabled = contextConsentUiEnabled &&
  contextPreviewUiEnabled &&
  import.meta.env.VITE_ENABLE_REFLECT_PREVIEW_GATE5_QA === 'true';

const ORIGIN = 'https://reflect-ai-api-staging.up.railway.app';
const PREVIEW = ORIGIN + '/v1/privacy/context-preview';
const CONSENT = ORIGIN + '/v1/privacy/context-consent';
const GRANT_ID = /^[A-Za-z0-9_-]{16,80}$/;
const SAFE_FAILURE = new Set([
  'qa-disabled', 'qa-unauthenticated', 'qa-invalid-target',
  'qa-transport-error', 'qa-stale-owner'
]);
const stop = code => { throw new Error(code); };

function currentOwner(principal, ownerUid) {
  if (!principal || typeof ownerUid !== 'string' ||
      !ownerUid || principal.uid !== ownerUid ||
      auth.currentUser?.uid !== ownerUid) stop('qa-stale-owner');
}

async function headersFor(principal, ownerUid) {
  currentOwner(principal, ownerUid);
  let idToken, attestation;
  try {
    [idToken, attestation] = await Promise.all([
      principal.getIdToken(),
      getLimitedUseToken(appCheckClient)
    ]);
  } catch { stop('qa-unauthenticated'); }
  currentOwner(principal, ownerUid);
  if (!idToken || !attestation?.token) stop('qa-unauthenticated');
  // Deliberately a short-lived local value, never setState/console/localStorage.
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + idToken,
    'X-Firebase-AppCheck': attestation.token
  };
}

async function post(path, payload, headers, principal, ownerUid, signal, checkGrantId) {
  currentOwner(principal, ownerUid);
  if (signal?.aborted) stop('qa-transport-error');
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(path, {
      method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    currentOwner(principal, ownerUid);
    // Never read a Preview response body; it contains synthetic turns.
    if (payload.action !== 'list') return { status: response.status };
    if (response.status !== 200) return { status: response.status, listValid: false };
    const value = await response.json().catch(() => null);
    currentOwner(principal, ownerUid);
    const listValid = Array.isArray(value?.grants) &&
      value.grants.length <= 100 && value.grants.every(item =>
        item && typeof item.grantId === 'string' &&
        typeof item.sourceId === 'string' &&
        item.scope === CONTEXT_SCOPE &&
        Number.isSafeInteger(item.expiresAtMs));
    // Keep no list or IDs in React state or the return value.
    return {
      status: response.status,
      listValid,
      targetPresent: listValid && value.grants.some(item =>
        item.grantId === checkGrantId &&
        item.sourceId === GATE5_SESSION_ID &&
        item.expiresAtMs > Date.now())
    };
  } catch {
    stop('qa-transport-error');
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

function statusOnly(kind, expected, observed, extra = true) {
  return Object.freeze({
    kind,
    passed: extra && observed.length === expected.length &&
      observed.every((status, i) => status === expected[i]),
    // Only numeric statuses; never tokens, grant IDs, transcripts or response JSON.
    statuses: Object.freeze([...observed])
  });
}

/**
 * `kind`: replay, cross-route, or revoke-deny. Each is independently opt-in.
 * `revoke-deny` is the sole write: the owner explicitly chose that action
 * for one existing synthetic-only grant. It never issues a new grant.
 */
export async function runGate5PreviewAudit({
  kind, grantId, sourceId, ownerUid, signal
}) {
  if (!gate5PreviewQaUiEnabled || !appCheckClient) stop('qa-disabled');
  if (!['replay', 'cross-route', 'revoke-deny'].includes(kind) ||
      sourceId !== GATE5_SESSION_ID || !GRANT_ID.test(grantId || '')) {
    stop('qa-invalid-target');
  }
  const principal = auth.currentUser;
  currentOwner(principal, ownerUid);
  const body = Object.freeze({ grantId, sourceId, scope: CONTEXT_SCOPE });
  const observed = [];

  if (kind === 'replay') {
    // EXACT same credentials + JSON, sequential; first 200, replay 401.
    const signed = await headersFor(principal, ownerUid);
    observed.push((await post(PREVIEW, body, signed, principal, ownerUid, signal)).status);
    if (observed[0] !== 200) return statusOnly(kind, [200, 401], observed);
    observed.push((await post(PREVIEW, body, signed, principal, ownerUid, signal)).status);
    return statusOnly(kind, [200, 401], observed);
  }

  if (kind === 'cross-route') {
    // Preview -> Consent with one App Check token; then the inverse with a new token.
    const first = await headersFor(principal, ownerUid);
    observed.push((await post(PREVIEW, body, first, principal, ownerUid, signal)).status);
    if (observed[0] !== 200) return statusOnly(kind, [200, 401, 200, 401], observed);
    observed.push((await post(CONSENT, { action: 'list' }, first,
      principal, ownerUid, signal)).status);
    if (observed[1] !== 401) return statusOnly(kind, [200, 401, 200, 401], observed);
    const second = await headersFor(principal, ownerUid);
    observed.push((await post(CONSENT, { action: 'list' }, second,
      principal, ownerUid, signal)).status);
    if (observed[2] !== 200) return statusOnly(kind, [200, 401, 200, 401], observed);
    observed.push((await post(PREVIEW, body, second, principal, ownerUid, signal)).status);
    return statusOnly(kind, [200, 401, 200, 401], observed);
  }

  // Confirm this exact synthetic grant exists BEFORE a deliberately selected revoke.
  const before = await post(CONSENT, { action: 'list' },
    await headersFor(principal, ownerUid), principal, ownerUid, signal, grantId);
  observed.push(before.status);
  if (before.status !== 200 || !before.listValid || !before.targetPresent) {
    return statusOnly(kind, [200, 200, 200, 403], observed, false);
  }

  const revoke = await post(CONSENT, { action: 'revoke', grantId },
    await headersFor(principal, ownerUid), principal, ownerUid, signal);
  observed.push(revoke.status);
  if (revoke.status !== 200) return statusOnly(kind, [200, 200, 200, 403], observed);

  const after = await post(CONSENT, { action: 'list' },
    await headersFor(principal, ownerUid), principal, ownerUid, signal, grantId);
  observed.push(after.status);
  if (after.status !== 200 || !after.listValid || after.targetPresent) {
    return statusOnly(kind, [200, 200, 200, 403], observed, false);
  }

  // New limited-use App Check for direct Preview: a 401 would NOT prove revoke.
  observed.push((await post(PREVIEW, body,
    await headersFor(principal, ownerUid), principal, ownerUid, signal)).status);
  return statusOnly(kind, [200, 200, 200, 403], observed);
}

export function gate5SafeError(error) {
  return SAFE_FAILURE.has(error?.message) ? error.message : 'qa-transport-error';
}
