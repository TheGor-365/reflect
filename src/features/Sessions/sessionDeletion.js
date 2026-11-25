import { doc, runTransaction } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';
import { isArchivedRecord } from '../Archive/archiveSelectors';

// Owner-scoped and explicitly confirmed. Linked goals, diary entries and
// private AI receipts are NOT deleted. Firestore Rules enforce UID ownership.
const validId = value =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function deleteOwnerSession(ownerId, sessionId) {
  if (!db || !validId(appId) || !validId(ownerId) ||
      !validId(sessionId)) {
    throw new Error('invalid-session-deletion');
  }
  // Load the transport only when explicitly requested. Never fall back
  // after secure selection, including a misconfigured or unavailable route.
  if (import.meta.env.VITE_ENABLE_REFLECT_SESSION_DELETION === 'true') {
    const { deleteSessionSecurely } = await import('../../api/sessionDeletionService');
    return deleteSessionSecurely(ownerId, sessionId);
  }
  const sessionRef = doc(db, 'artifacts', appId, 'users', ownerId,
    'sessions', sessionId);
  // The authoritative archivedAt check and deletion share a single transaction.
  // If the document is archived by another tab, Firestore retries the read
  // against the new version; deletion must then fail instead of bypassing archive.
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(sessionRef);
    if (!snapshot.exists()) throw new Error('session-no-longer-exists');
    if (isArchivedRecord(snapshot.data())) {
      throw new Error('archived-session-deletion-blocked');
    }
    transaction.delete(sessionRef);
    return sessionId;
  });
}
