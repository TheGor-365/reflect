/**
 * AI-01H/D — opt-in, non-billable acceptance of the *new* staging consent API.
 *
 * No historical context, grant creation, provider call, or secret exposure.
 * Only list; token-replay denial; revoke of a fresh, unknown random ID.
 * An unknown ID is not stored by the backend, and no existing grants are
 * revoked. Actual owner grant/list/revoke remains a later explicit UI action.
 */
import { getLimitedUseToken } from 'firebase/app-check';
import { auth, appCheckClient } from '../firebase/config';
import { railwayAiEnabled } from './reflectRailwayService';

const URL = 'https://reflect-ai-api-staging.up.railway.app/v1/privacy/context-consent';
const ERROR_CODES = [
  'unauthenticated', 'reauthentication-required', 'permission-denied',
  'attestation-unavailable', 'invalid-argument', 'resource-exhausted',
  'unavailable', 'not-found'
];
const deny = code => { throw new Error(ERROR_CODES.includes(code)
  ? code : 'consent-audit-unavailable'); };

async function post(command, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(URL, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(command),
      signal: controller.signal
    });
    const value = await response.json().catch(() => null);
    // This method neither stores nor exposes returned grant/source IDs.
    return {
      status: response.status,
      error: ERROR_CODES.includes(value?.error) ? value.error : null,
      validList: Array.isArray(value?.grants) &&
        value.grants.length < 100 &&
        value.grants.every(item =>
          item && typeof item.grantId === 'string' &&
          typeof item.sourceId === 'string' &&
          item.scope === 'session-turns' &&
          Number.isSafeInteger(item.expiresAtMs)),
      revoked: value?.status === 'revoked'
    };
  } catch {
    deny('consent-audit-unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

async function signedHeaders(principal) {
  if (auth.currentUser?.uid !== principal.uid) deny('unauthenticated');
  let authToken, check;
  try {
    [authToken, check] = await Promise.all([
      principal.getIdToken(),
      getLimitedUseToken(appCheckClient)
    ]);
  } catch {
    deny('attestation-unavailable');
  }
  if (!authToken || !check?.token ||
      auth.currentUser?.uid !== principal.uid) deny('unauthenticated');
  return {
    Authorization: 'Bearer ' + authToken,
    'X-Firebase-AppCheck': check.token
  };
}

/**
 * Four sequential probes, only when the signed-in owner clicks:
 * 1. unsigned list -> 401; 2. signed list -> 200;
 * 3. identical consumed App Check replay -> 401;
 * 4. revoke of cryptographically random previously unknown ID -> 200.
 * Never issue grant. Never display or log tokens, UIDs or grant/source IDs.
 */
export async function auditStagingConsentEndpoint() {
  if (!railwayAiEnabled || !appCheckClient || !auth.currentUser ||
      !globalThis.crypto?.randomUUID) deny('unauthenticated');

  const unsigned = await post({ action: 'list' });
  if (unsigned.status !== 401 || unsigned.error !== 'unauthenticated') {
    deny('consent-audit-unavailable');
  }

  const principal = auth.currentUser;
  const signed = await signedHeaders(principal);
  const listing = await post({ action: 'list' }, signed);
  if (listing.status !== 200 || !listing.validList) {
    deny(listing.error);
  }

  if (auth.currentUser?.uid !== principal.uid) deny('unauthenticated');
  const replay = await post({ action: 'list' }, signed);
  if (replay.status !== 401 || replay.error !== 'unauthenticated') {
    deny('consent-audit-unavailable');
  }

  const fresh = await signedHeaders(principal);
  // UUIDv4 is unguessable; revoking an unknown ID is an idempotent no-op.
  // No user data and no existing grant IDs are used as inputs.
  const unknownId = globalThis.crypto.randomUUID();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
    .test(unknownId)) deny('consent-audit-unavailable');
  const revoked = await post({
    action: 'revoke', grantId: unknownId
  }, fresh);
  if (revoked.status !== 200 || !revoked.revoked) {
    deny(revoked.error);
  }

  return Object.freeze({ status: 'verified', checks: 4 });
}
