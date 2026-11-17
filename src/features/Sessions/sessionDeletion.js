import { deleteDoc, doc } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';

// Owner-scoped and explicitly confirmed. Linked goals, diary entries and
// private AI receipts are NOT deleted. Firestore Rules enforce UID ownership.
const validId = value =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function deleteOwnerSession(ownerId, sessionId) {
  if (!db || !validId(appId) || !validId(ownerId) ||
      !validId(sessionId)) {
    throw new Error('invalid-session-deletion');
  }
  await deleteDoc(doc(db, 'artifacts', appId, 'users', ownerId,
    'sessions', sessionId));
  return sessionId;
}
