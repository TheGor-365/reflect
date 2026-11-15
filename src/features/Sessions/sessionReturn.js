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
export async function saveSessionReturn({
  userId, sessionId, visitId, note, goalId = null, nextStep = ''
}) {
  const hasGoal = goalId !== null && goalId !== '';
  const stepValid = typeof nextStep === 'string' &&
    (nextStep === '' || (nextStep.trim().length > 0 &&
      nextStep.trim().length <= 240 && !/[\u0000-\u001f\u007f]/.test(nextStep)));
  if (!db || !idOk(userId) || !idOk(sessionId) || !idOk(visitId) || !noteOk(note) ||
      !stepValid || (hasGoal && (!idOk(goalId) || !nextStep.trim()))) {
    throw new Error('Проверьте текст наблюдения, следующий шаг и выбранную цель.');
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
    if (hasGoal) {
      const goalRef = doc(db, `artifacts/${appId}/users/${userId}/goals`, goalId);
      const goalSnapshot = await tx.get(goalRef);
      if (!goalSnapshot.exists()) {
        throw new Error('Связанная цель больше не существует. Запись не выполнена.');
      }
      const goal = goalSnapshot.data();
      const decisions = source.recommendationDecisions;
      const decision = decisions && typeof decisions === 'object' &&
        !Array.isArray(decisions) && typeof goal.sourceRecommendationKey === 'string'
        ? decisions[goal.sourceRecommendationKey] : null;
      if (goal.sessionId !== sessionId ||
          goal.sourceType !== 'user-accepted-ai-recommendation' ||
          decision?.status !== 'accepted' || decision.goalRemovedAt ||
          decision.goalId !== goalId ||
          decision.assistantMessageId !== goal.sourceAssistantMessageId) {
        throw new Error('Связь цели с сохранённым решением не подтверждена.');
      }
    }
    const visit = {
      id: visitId, author: 'user', type: 'return-check-in',
      text: note.trim(), recordedAtClient: Timestamp.now(),
      ...(nextStep.trim() ? { nextStep: nextStep.trim() } : {}),
      ...(hasGoal ? { goalId } : {})
    };
    tx.update(ref, {
      returnCheckIns: [...existing, visit],
      lastReturnReceivedAt: serverTimestamp()
    });
    return visit;
  });
}
