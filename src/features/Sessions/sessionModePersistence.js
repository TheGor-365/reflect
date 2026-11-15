import { doc, getDocFromServer, updateDoc, deleteField,
  serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';
import { ACCOUNT_MODE, normalizedSessionMode } from './sessionModeModel';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
/**
 * Explicit owner click; no automatically issued history grants or provider
 * calls. An absent session override inherits the account AI preference.
 * Server readback confirms that the chosen mode was durably persisted.
 */
export async function saveSessionMode({ userId, sessionId, mode }) {
  const normalized = normalizedSessionMode(mode);
  if (!db || appId !== 'reflect-8fdc8' || !ID.test(userId || '') ||
      !ID.test(sessionId || '') || normalized === null) {
    throw new Error('session-mode-invalid');
  }
  const ref = doc(db, 'artifacts', appId, 'users', userId, 'sessions', sessionId);
  await updateDoc(ref, {
    interactionMode: normalized === ACCOUNT_MODE ? deleteField() : normalized,
    updatedAt: serverTimestamp()
  });
  const snapshot = await getDocFromServer(ref);
  if (!snapshot.exists() ||
      normalizedSessionMode(snapshot.data()?.interactionMode) !== normalized) {
    throw new Error('session-mode-unconfirmed');
  }
  return normalized;
}
