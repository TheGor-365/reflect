/**
 * AI-01H — opt-in live staging verification of the *existing* AI diagnostics
 * Auth + consumable App Check boundary. No history, consent, prompts or
 * paid provider call. Does NOT activate the new consent endpoint.
 */
import { getLimitedUseToken } from 'firebase/app-check';
import { auth, appCheckClient } from '../firebase/config';
import { railwayAiEnabled } from './reflectRailwayService';

const ORIGIN = 'https://reflect-ai-api-staging.up.railway.app';
const DIAGNOSTICS = ORIGIN + '/v1/ai/diagnostics';
const STATUSES = ['ready', 'outbound-disabled', 'runtime-disabled'];
const FAILURES = ['unauthenticated', 'permission-denied', 'attestation-unavailable',
  'reauthentication-required', 'auth-permission-missing',
  'auth-verification-unavailable'];

function auditFailure(code) {
  throw new Error(FAILURES.includes(code) ? code : 'security-audit-unavailable');
}

async function postDiagnostics(headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(DIAGNOSTICS, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: '{}',
      signal: controller.signal
    });
    const result = await response.json().catch(() => null);
    // Return only allowlisted protocol fields. Never return tokens, UID,
    // request/response bodies or unrecognized server diagnostics.
    return {
      status: response.status,
      error: FAILURES.includes(result?.error) ? result.error : null,
      model: result?.model === 'grok-4.3' ? 'grok-4.3' : null,
      readiness: STATUSES.includes(result?.status) ? result.status : null
    };
  } catch {
    auditFailure('security-audit-unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Three checks from the current logged-in staging browser:
 * (1) unauthenticated POST rejected, (2) real signed Firebase Auth and
 * limited-use App Check accepted, (3) replay of exactly the SAME
 * App Check token rejected. Never log, export, or store these tokens.
 */
export async function auditStagingAuthAppCheck() {
  if (!railwayAiEnabled || !appCheckClient || !auth.currentUser) {
    auditFailure('unauthenticated');
  }

  const noAuth = await postDiagnostics();
  if (noAuth.status !== 401 || noAuth.error !== 'unauthenticated') {
    auditFailure('security-audit-unavailable');
  }

  const currentUser = auth.currentUser;
  let bearer, attestation;
  try {
    [bearer, attestation] = await Promise.all([
      currentUser.getIdToken(),
      getLimitedUseToken(appCheckClient)
    ]);
  } catch {
    auditFailure('attestation-unavailable');
  }
  if (!bearer || !attestation?.token ||
      auth.currentUser?.uid !== currentUser.uid) {
    auditFailure('unauthenticated');
  }

  const verifiedHeaders = {
    Authorization: 'Bearer ' + bearer,
    'X-Firebase-AppCheck': attestation.token
  };
  const permitted = await postDiagnostics(verifiedHeaders);
  if (permitted.status !== 200 || permitted.model !== 'grok-4.3' ||
      !permitted.readiness) {
    auditFailure(permitted.error);
  }

  // Verify the account did not switch before the replay probe.
  if (auth.currentUser?.uid !== currentUser.uid) {
    auditFailure('unauthenticated');
  }
  const replay = await postDiagnostics(verifiedHeaders);
  if (replay.status !== 401 || replay.error !== 'unauthenticated') {
    auditFailure('security-audit-unavailable');
  }
  return Object.freeze({
    status: 'verified',
    checks: 3,
    readiness: permitted.readiness
  });
}
