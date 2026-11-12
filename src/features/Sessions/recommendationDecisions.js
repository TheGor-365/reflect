import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';

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
  goalId, goalTitle, goalPurpose = ''
}) {
  if (!db || !idOk(userId) || !idOk(sessionId) ||
      !['goal', ...STATUSES].includes(action)) {
    throw new Error('Нет безопасного контекста для сохранения решения.');
  }
  const key = recommendationKey(assistantMessageId, candidateIndex);
  if (action === 'goal' &&
      (!idOk(goalId) || !textOk(goalTitle, 240) ||
        typeof goalPurpose !== 'string' || goalPurpose.length > 1000)) {
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
    const history = Array.isArray(session.chatHistory) ? session.chatHistory : [];
    const assistantIndex = history.findIndex(message =>
      message?.id === assistantMessageId && message?.role === 'assistant');
    const assistant = history[assistantIndex];
    const candidate = assistant?.interaction?.version === 'reflect.interaction.v1'
      ? assistant.interaction.recommendationCandidates?.[candidateIndex] : null;
    if (assistantIndex < 1 || !candidate ||
        !textOk(candidate.title, 120) || !textOk(candidate.rationale, 350)) {
      throw new Error('Эта рекомендация отсутствует в сохранённом ответе Reflect.');
    }
    // An assistant turn is tied to a real user-authored turn in the same
    // saved history, never to an inferred/third-party memory.
    const preceding = history.slice(0, assistantIndex).reverse().find(message =>
      message?.role === 'user' && idOk(message.id));
    if (!preceding) throw new Error('Не найден исходный текст сеанса.');
    const existing = session.recommendationDecisions &&
      typeof session.recommendationDecisions === 'object' &&
      !Array.isArray(session.recommendationDecisions)
      ? session.recommendationDecisions : {};
    const previous = existing[key];
    // Once a goal has been created, later clicks must not silently remove
    // its source link or create another goal from the same recommendation.
    if (previous?.status === 'accepted') {
      if (action === 'goal') return previous;
      throw new Error('Рекомендация уже стала целью. Измените цель в разделе «Цели».');
    }
    if (action !== 'goal' && previous?.status === action) return previous;
    let result = {
      status: action === 'goal' ? 'accepted' : action,
      title: candidate.title,
      assistantMessageId, sourceMessageId: preceding.id,
      candidateIndex, promptVersion: assistant.interaction.version,
      decidedAt: serverTimestamp()
    };
    if (action === 'goal') {
      const goalSnapshot = await transaction.get(goalRef);
      if (goalSnapshot.exists()) {
        const previousGoal = goalSnapshot.data();
        if (previousGoal.sessionId !== sessionId ||
            previousGoal.sourceRecommendationKey !== key) {
          throw new Error('ID цели занят другой записью. Повторная запись отменена.');
        }
      } else {
        transaction.set(goalRef, {
          text: goalTitle.trim(), purpose: goalPurpose.trim(),
          type: 'checklist', subItems: [], reflections: [], postponeCount: 0,
          completed: false, status: 'active',
          sessionId, sourceRecommendationKey: key,
          sourceMessageId: preceding.id, sourceAssistantMessageId: assistantMessageId,
          sourceType: 'user-accepted-ai-recommendation',
          createdAt: serverTimestamp()
        });
      }
      result = { ...result, goalId };
    }
    transaction.update(sessionRef, {
      recommendationDecisions: { ...existing, [key]: result }
    });
    return result;
  });
}
