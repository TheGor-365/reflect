import { getLimitedUseToken } from 'firebase/app-check';
import { auth, appCheckClient, stagingAppCheckEnabled, hostedAiEnabled, appId } from '../firebase/config';

const requested = import.meta.env.VITE_ENABLE_REFLECT_SESSION_DELETION === 'true';
const origin = 'https://reflect-ai-api-staging.up.railway.app';
const ID = /^[A-Za-z0-9_-]{1,128}$/;
export const secureSessionDeletionRequested = requested;
export const secureSessionDeletionEnabled = requested &&
  import.meta.env.VITE_REFLECT_RAILWAY_AI_ORIGIN === origin &&
  stagingAppCheckEnabled && !hostedAiEnabled && appId === 'reflect-8fdc8' &&
  auth?.app?.options?.projectId === 'reflect-ai-staging' &&
  auth?.app?.options?.appId === '1:599679789981:web:d4d8743dbff0fe40af1d74' &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS !== 'true';

// Only exact status/body pairs from the pinned route are definitive refusals.
// A 503 can occur after commit; unknown responses are never proof of non-deletion.
const refusals = new Map([
  [400, 'invalid-argument'], [401, 'unauthenticated'],
  [403, 'permission-denied'], [404, 'session-not-found'],
  [409, 'archived-session'], [429, 'resource-exhausted']
]);
function deletionError(outcome, code = 'session-deletion-unavailable') {
  return Object.assign(new Error('session-deletion-unavailable'), { outcome, code });
}

export async function deleteSessionSecurely(ownerId, sessionId) {
  if (!secureSessionDeletionEnabled || !appCheckClient)
    throw deletionError('not-sent');
  if (typeof ownerId !== 'string' || !ID.test(ownerId) ||
      typeof sessionId !== 'string' || !ID.test(sessionId))
    throw deletionError('not-sent', 'invalid-session-deletion');
  const user = auth.currentUser;
  if (!user || user.uid !== ownerId) throw deletionError('not-sent', 'session-deletion-identity-changed');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let dispatched = false;
  let refusal = null;
  try {
    const [idToken, attestation] = await Promise.all([
      user.getIdToken(), getLimitedUseToken(appCheckClient)
    ]);
    if (controller.signal.aborted || auth.currentUser !== user || user.uid !== ownerId ||
        typeof idToken !== 'string' || !idToken ||
        typeof attestation?.token !== 'string' || !attestation.token)
      throw Error('session-deletion-unavailable');
    dispatched = true;
    const response = await fetch(origin + '/v1/privacy/session-deletion', {
      method: 'POST', mode: 'cors', cache: 'no-store', credentials: 'omit',
      redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken,
        'X-Firebase-AppCheck': attestation.token },
      body: JSON.stringify({ confirmed: true, sessionId })
    });
    const data = await response.json().catch(() => null);
    if (auth.currentUser !== user || user.uid !== ownerId || controller.signal.aborted)
      throw deletionError('unknown');
    const exact = data && typeof data === 'object' && !Array.isArray(data) &&
      Object.keys(data).length === 1;
    if (exact && response.status === 200 && data.status === 'revoked') return sessionId;
    const code = refusals.get(response.status);
    if (exact && code && data.error === code) refusal = code;
    throw deletionError('unknown');
  } catch {
    // Never trust error properties supplied by network/token dependencies.
    // Only our own validated response can establish a definitive refusal.
    throw refusal ? deletionError('rejected', refusal) :
      deletionError(dispatched ? 'unknown' : 'not-sent');
  } finally {
    clearTimeout(timer);
  }
}
