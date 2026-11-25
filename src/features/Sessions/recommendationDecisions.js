import { doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { isDateOnly, localNoonForDueDay } from '../Goals/goalDomain';
import { db, appId } from '../../firebase/config';
import { isSupportedInteraction } from './interactionVersions';
import { recommendationGoalGate } from './recommendationGoalGate';
import { isArchivedRecord } from '../Archive/archiveSelectors';
import {
  appendOwnerEvidenceInTransaction, createMemoryEventId, memoryLedgerEnabled
} from '../Memory/memoryLedgerOperations';

const idOk = value => typeof value === 'string' &&
  /^[A-Za-z0-9_-]{1,128}$/.test(value);
const textOk = (value, max) => typeof value === 'string' &&
  value.trim().length > 0 && value.trim().length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value);
const STATUSES = ['saved', 'postponed', 'dismissed'];

export function recommendationKey(messageId, index) {
  if (!idOk(messageId) || !Number.isInteger(index) || index < 0 || index > 1) {
    throw new Error('Некорректная ссылка на рекомендацию.');
  }
  return `r-${messageId}-${index}`;
}

/**
 * User-triggered, UID-scoped Firestore transaction. Never accepts an AI
 * proposal as the source of truth: resolve it from the saved transcript.
 * The same transaction records the explicit decision AND creates a linked
 * goal, so no unlinked/orphaned objects appear on partial failure.
 */
export async function applyRecommendationDecision({
  userId, sessionId, assistantMessageId, candidateIndex, action,
  goalId, goalTitle, goalPurpose = '', goalStep = '',
  goalDueDay = '', goalCriteria = ''
}) {
  if (!db || !idOk(appId) || !idOk(userId) || !idOk(sessionId) ||
      !['goal', ...STATUSES].includes(action)) {
    throw new Error('Нет безопасного контекста для сохранения решения.');
  }
  const key = recommendationKey(assistantMessageId, candidateIndex);
  const memoryEventId = memoryLedgerEnabled() ? createMemoryEventId() : null;
  if (action === 'goal' &&
      (!idOk(goalId) || !textOk(goalTitle, 240) ||
        typeof goalPurpose !== 'string' || goalPurpose.length > 1000 ||
        !textOk(goalStep, 240) || !textOk(goalCriteria, 500) ||
        (goalDueDay !== '' && !isDateOnly(goalDueDay)))) {
    throw new Error('Проверьте название и описание цели.');
  }
  const root = `artifacts/${appId}/users/${userId}`;
  const sessionRef = doc(db, root, 'sessions', sessionId);
  const goalRef = action === 'goal' ? doc(db, root, 'goals', goalId) : null;
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(sessionRef);
    if (!snapshot.exists()) {
      throw new Error('Сначала сохраните сеанс. Несохранённые ответы не становятся целями.');
    }
    const session = snapshot.data();
    if (isArchivedRecord(session)) {
      throw new Error('Исходный сеанс в архиве. Сначала восстановите его.');
    }
    const history = Array.isArray(session.chatHistory) ? session.chatHistory : [];
    const assistantIndex = history.findIndex(message =>
      message?.id === assistantMessageId && message?.role === 'assistant');
    const assistant = history[assistantIndex];
    const candidate = isSupportedInteraction(assistant?.interaction)
      ? assistant.interaction.recommendationCandidates?.[candidateIndex] : null;
    if (assistantIndex < 1 || history.filter(turn => turn?.id === assistantMessageId).length !== 1 ||
        !candidate || !Array.isArray(candidate.sourceRefs) ||
        candidate.sourceRefs.length !== 1 || candidate.sourceRefs[0] !== 'current-message' ||
        !textOk(candidate.title, 120) || !textOk(candidate.rationale, 350)) {
      throw new Error('Эта рекомендация отсутствует в сохранённом ответе Reflect.');
    }
    // An assistant turn is tied to a real user-authored turn in the same
    // saved history, never to an inferred/third-party memory.
    const preceding = history.slice(0, assistantIndex).reverse().find(message =>
      message?.role === 'user' && idOk(message.id));
    if (!preceding || typeof preceding.content !== 'string' || !preceding.content.trim() ||
        history.filter(turn => turn?.id === preceding.id).length !== 1) {
      throw new Error('Не найден однозначный исходный текст сеанса.');
    }
    const existing = session.recommendationDecisions &&
      typeof session.recommendationDecisions === 'object' &&
      !Array.isArray(session.recommendationDecisions)
      ? session.recommendationDecisions : {};
    const previous = existing[key];
    if (isArchivedRecord(previous)) {
      throw new Error('Рекомендация в архиве. Сначала восстановите её.');
    }
    // Once a goal has been created, later clicks must not silently remove
    // its source link or create another goal from the same recommendation.
    if (previous?.status === 'accepted') {
      if (action === 'goal') return previous;
      throw new Error('Рекомендация уже стала целью. Измените цель в разделе «Цели».');
    }
    if (action !== 'goal' && previous?.status === action) return previous;
    // The visible button alone is not a security boundary: enforce the
    // same owner-evidence prerequisites against current Firestore data.
    // Leave save/postpone/dismiss available regardless of gate result.
    if (action === 'goal') {
      const gate = recommendationGoalGate({
        interaction: assistant.interaction,
        assistantMessageId, reviews: session.hypothesisReviews
      });
      if (!gate.allowed) throw new Error(gate.reason);
    }
    let result = {
      status: action === 'goal' ? 'accepted' : action,
      title: candidate.title,
      assistantMessageId, sourceMessageId: preceding.id,
      candidateIndex, promptVersion: assistant.interaction.version,
      decidedAt: serverTimestamp()
    };
    let newGoal = null;
    if (action === 'goal') {
      const goalSnapshot = await transaction.get(goalRef);
      if (goalSnapshot.exists()) {
        const previousGoal = goalSnapshot.data();
        if (previousGoal.sessionId !== sessionId ||
            previousGoal.sourceRecommendationKey !== key ||
            previousGoal.sourceMessageId !== preceding.id ||
            previousGoal.sourceAssistantMessageId !== assistantMessageId ||
            previousGoal.sourceType !== 'user-accepted-ai-recommendation') {
          throw new Error('ID цели занят другой записью. Повторная запись отменена.');
        }
      } else {
        newGoal = {
          text: goalTitle.trim(), purpose: goalPurpose.trim(),
          successCriteria: goalCriteria.trim(),
          type: 'checklist',
          subItems: [{
            id: `${goalId}-step-0`, text: goalStep.trim(), completed: false
          }],
          ...(goalDueDay ? {
            dueDay: goalDueDay, date: goalDueDay,
            dueDate: Timestamp.fromDate(localNoonForDueDay(goalDueDay))
          } : {}),
          reflections: [], postponeCount: 0,
          completed: false, status: 'active',
          sessionId, sourceRecommendationKey: key,
          sourceMessageId: preceding.id, sourceAssistantMessageId: assistantMessageId,
          sourceType: 'user-accepted-ai-recommendation',
          createdAt: serverTimestamp()
        };
      }
      result = { ...result, goalId };
    }
    const recorded = memoryEventId ? await appendOwnerEvidenceInTransaction({
      tx: transaction, database: db, appId, ownerId: userId, sessionId,
      session, eventId: memoryEventId, kind: 'owner.recommendation.decision',
      // Long legacy message IDs can produce a key longer than the R10.0
      // 128-character source reference. The assistant turn plus payload index
      // still identifies the exact hypothesis/recommendation without loss.
      sourceRecordId: key.length <= 128 ? key : assistantMessageId,
      text: `Решение по рекомендации: ${result.status}. ${candidate.title}`,
      payload: { status: result.status, title: candidate.title,
        assistantMessageId, sourceMessageId: preceding.id, candidateIndex,
        ...(result.goalId ? { goalId: result.goalId } : {}) }
    }) : null;
    if (newGoal) transaction.set(goalRef, newGoal);
    if (recorded?.eventId) result = { ...result, memoryEventId: recorded.eventId };
    if (recorded?.suppressed) result = { ...result, memorySuppressed: true };
    transaction.update(sessionRef, {
      recommendationDecisions: { ...existing, [key]: result }
    });
    return result;
  });
}
