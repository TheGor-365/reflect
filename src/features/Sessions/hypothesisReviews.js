import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';

// Feedback is owner-written evidence about an AI hypothesis, not a model
// score, clinical assessment, goal, or consent to share private history.
import { hypothesisReviewKey, validateHypothesisReview } from './hypothesisReviewModel';

const idOk = value => typeof value === 'string' &&
  /^[A-Za-z0-9_-]{1,128}$/.test(value);

/**
 * Only a deliberate owner click writes a single review to the same saved
 * session. The source hypothesis must exist inside the saved assistant turn.
 * Transactional map merge prevents lost updates from other tabs.
 */
export async function saveHypothesisReview({
  userId, sessionId, assistantMessageId, hypothesisIndex, grade, comment = ''
}) {
  const data = validateHypothesisReview({ grade, comment });
  if (!db || !idOk(appId) || !idOk(userId) || !idOk(sessionId)) {
    throw new Error('Нет безопасного контекста для сохранения оценки.');
  }
  const key = hypothesisReviewKey(assistantMessageId, hypothesisIndex);
  const ref = doc(db, `artifacts/${appId}/users/${userId}`, 'sessions', sessionId);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('Сеанс ещё не сохранён.');
    const session = snapshot.data();
    const history = Array.isArray(session.chatHistory) ? session.chatHistory : [];
    const assistantIndex = history.findIndex(turn =>
      turn?.id === assistantMessageId && turn?.role === 'assistant');
    const turn = history[assistantIndex];
    const hypothesis = turn?.interaction?.version === 'reflect.interaction.v1'
      ? turn.interaction.insights?.[hypothesisIndex] : null;
    if (assistantIndex < 1 || typeof hypothesis !== 'string' ||
        !hypothesis.trim() || !history.slice(0, assistantIndex).some(t =>
          t?.role === 'user' && idOk(t.id))) {
      throw new Error('Гипотеза отсутствует в сохранённом ответе.');
    }
    const current = session.hypothesisReviews &&
      typeof session.hypothesisReviews === 'object' &&
      !Array.isArray(session.hypothesisReviews)
      ? session.hypothesisReviews : {};
    const previous = current[key];
    if (previous?.grade === data.grade && previous?.comment === data.comment) {
      return previous;
    }
    const result = {
      assistantMessageId, hypothesisIndex: hypothesisIndex,
      grade: data.grade, comment: data.comment,
      reviewedAt: serverTimestamp()
    };
    transaction.update(ref, {
      hypothesisReviews: { ...current, [key]: result }
    });
    return result;
  });
}
