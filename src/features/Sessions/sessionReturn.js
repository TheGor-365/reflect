import { doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';

const idOk = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const noteOk = value => typeof value === 'string' &&
  value.trim().length >= 1 && value.trim().length <= 1200 &&
  !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value);

/**
 * An authored return/check-in, NOT a provider inference or a sent AI message.
 * Reuses the existing owner-scoped session document and its existing rules.
 * Stable visit IDs make explicit retries safe after ambiguous network errors.
 */
export async function saveSessionReturn({ userId, sessionId, visitId, note }) {
  if (!db || !idOk(userId) || !idOk(sessionId) || !idOk(visitId) || !noteOk(note)) {
    throw new Error('Проверьте текст наблюдения и текущий сеанс.');
  }
  const ref = doc(db, `artifacts/${appId}/users/${userId}/sessions`, sessionId);
  return runTransaction(db, async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) throw new Error('Сеанс больше не существует. Запись не выполнена.');
    const source = snapshot.data();
    const existing = Array.isArray(source.returnCheckIns) ? source.returnCheckIns : [];
    const prior = existing.find(entry => entry?.id === visitId);
    if (prior) return prior;
    if (existing.length >= 80) {
      throw new Error('Для этого сеанса достигнут лимит отдельных возвращений.');
    }
    const visit = {
      id: visitId, author: 'user', type: 'return-check-in',
      text: note.trim(), recordedAtClient: Timestamp.now()
    };
    tx.update(ref, {
      returnCheckIns: [...existing, visit],
      lastReturnReceivedAt: serverTimestamp()
    });
    return visit;
  });
}
