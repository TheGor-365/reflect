import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';

// Feedback is owner-written evidence about an AI hypothesis, not a model
// score, clinical assessment, goal, or consent to share private history.
import { hypothesisReviewKey, validateHypothesisReview } from './hypothesisReviewModel';
import { isSupportedInteraction } from './interactionVersions';
import { isArchivedRecord } from '../Archive/archiveSelectors';
import {
  appendOwnerEvidenceInTransaction, createMemoryEventId, memoryLedgerEnabled
} from '../Memory/memoryLedgerOperations';

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
  const memoryEventId = memoryLedgerEnabled() ? createMemoryEventId() : null;
  const ref = doc(db, `artifacts/${appId}/users/${userId}`, 'sessions', sessionId);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('Сеанс ещё не сохранён.');
    const session = snapshot.data();
    if (isArchivedRecord(session)) {
      throw new Error('Сеанс в архиве. Сначала восстановите его.');
    }
    const history = Array.isArray(session.chatHistory) ? session.chatHistory : [];
    const assistantIndex = history.findIndex(turn =>
      turn?.id === assistantMessageId && turn?.role === 'assistant');
    const turn = history[assistantIndex];
    const hypothesis = isSupportedInteraction(turn?.interaction)
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
    const correctionSource = previous?.memoryEventId;
    const recorded = memoryEventId ? await appendOwnerEvidenceInTransaction({
      tx: transaction, database: db, appId, ownerId: userId, sessionId,
      session, eventId: memoryEventId,
      kind: correctionSource ? 'owner.correction' : 'owner.hypothesis.review',
      // Long legacy message IDs can produce a key longer than the R10.0
      // 128-character source reference. The assistant turn plus payload index
      // still identifies the exact hypothesis/recommendation without loss.
      sourceRecordId: key.length <= 128 ? key : assistantMessageId,
      text: `Оценка гипотезы: ${data.grade}. ${data.comment || 'Без комментария'}`,
      payload: { grade: data.grade, comment: data.comment,
        assistantMessageId, hypothesisIndex },
      ...(correctionSource ? { supersedes: correctionSource } : {})
    }) : null;
    const result = {
      assistantMessageId, hypothesisIndex: hypothesisIndex,
      grade: data.grade, comment: data.comment,
      reviewedAt: serverTimestamp(),
      ...(recorded?.eventId ? { memoryEventId: recorded.eventId } : {}),
      ...(recorded?.suppressed ? { memorySuppressed: true } : {})
    };
    transaction.update(ref, {
      hypothesisReviews: { ...current, [key]: result }
    });
    return result;
  });
}
