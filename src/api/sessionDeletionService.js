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

export async function deleteSessionSecurely(ownerId, sessionId) {
  if (!secureSessionDeletionEnabled || !appCheckClient)
    throw Error('session-deletion-unavailable');
  if (typeof ownerId !== 'string' || !ID.test(ownerId) ||
      typeof sessionId !== 'string' || !ID.test(sessionId))
    throw Error('invalid-session-deletion');
  const user = auth.currentUser;
  if (!user || user.uid !== ownerId) throw Error('session-deletion-identity-changed');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const [idToken, attestation] = await Promise.all([
      user.getIdToken(), getLimitedUseToken(appCheckClient)
    ]);
    if (controller.signal.aborted || auth.currentUser !== user || user.uid !== ownerId ||
        typeof idToken !== 'string' || !idToken ||
        typeof attestation?.token !== 'string' || !attestation.token)
      throw Error('session-deletion-unavailable');
    const response = await fetch(origin + '/v1/privacy/session-deletion', {
      method: 'POST', mode: 'cors', cache: 'no-store', credentials: 'omit',
      redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken,
        'X-Firebase-AppCheck': attestation.token },
      body: JSON.stringify({ confirmed: true, sessionId })
    });
    const data = await response.json().catch(() => null);
    if (auth.currentUser !== user || user.uid !== ownerId || controller.signal.aborted ||
        response.status !== 200 || data?.status !== 'revoked' ||
        Object.keys(data).length !== 1) throw Error('session-deletion-unavailable');
    return sessionId;
  } catch {
    // No raw network errors, no automatic retry, no Firestore fallback.
    throw Error('session-deletion-unavailable');
  } finally {
    clearTimeout(timer);
  }
}
