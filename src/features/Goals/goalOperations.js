import {
  collection, deleteField, doc, runTransaction, serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db, appId } from '../../firebase/config';
import { dueDayOf, isDateOnly, localNoonForDueDay, nextSubtasks, statusOf } from './goalDomain';

const root = userId => {
  if (typeof userId !== 'string' || !userId) {
    throw new Error('Сессия авторизации недоступна. Запись не выполнена.');
  }
  return `artifacts/${appId}/users/${userId}/goals`;
};

export function newGoalId(userId) {
  return doc(collection(db, root(userId))).id;
}

export function newSubtaskId(userId) {
  return doc(collection(db, root(userId))).id;
}

function validatedText(value, label, max) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) {
    throw new Error(`Поле «${label}» должно содержать от 1 до ${max} символов.`);
  }
  return text;
}

function validatedDate(day) {
  if (!day) return '';
  if (!isDateOnly(day)) throw new Error('Неверная календарная дата срока.');
  return day;
}

function dateFields(day) {
  const parsed = validatedDate(day);
  return parsed ? {
    dueDay: parsed, date: parsed,
    dueDate: Timestamp.fromDate(localNoonForDueDay(parsed))
  } : {};
}

export async function createGoal(userId, goalId, draft) {
  if (!goalId) throw new Error('Не удалось сформировать идентификатор цели.');
  const text = validatedText(draft.text, 'Название', 240);
  const purpose = typeof draft.purpose === 'string' ? draft.purpose.trim().slice(0, 1000) : '';
  const type = draft.type === 'reflection' ? 'reflection' : 'checklist';
  const subItems = type === 'checklist' && Array.isArray(draft.subItems)
    ? draft.subItems.map(item => ({
      id: item.id, text: validatedText(item.text, 'Подзадача', 240),
      completed: false
    })) : [];

  const ref = doc(db, root(userId), goalId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    // Retry of an ambiguous write must not duplicate the goal or reset its
    // completion state on a second write.
    if (snapshot.exists()) return;
    transaction.set(ref, {
      text, purpose, type, subItems, completed: false, status: 'active',
      ...dateFields(draft.dueDay), reflections: [], postponeCount: 0,
      createdAt: serverTimestamp()
    });
  });
  return goalId;
}

export async function updateGoal(userId, goalId, action) {
  if (!goalId) throw new Error('Идентификатор цели отсутствует.');
  const ref = doc(db, root(userId), goalId);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error('Цель больше не существует. Проверьте обновлённый список.');
    }
    const original = snapshot.data();
    const items = Array.isArray(original.subItems) ? original.subItems : [];
    let patch;
    switch (action.kind) {
      case 'status': {
        if (!['active', 'paused', 'completed'].includes(action.status)) {
          throw new Error('Неизвестный статус цели.');
        }
        // Stable, idempotent explicit status commands: retries must never
        // replace an already confirmed completedAt timestamp.
        if (statusOf(original) === action.status &&
            original.completed === (action.status === 'completed')) return;
        patch = {
          status: action.status,
          completed: action.status === 'completed',
          completedAt: action.status === 'completed' ? serverTimestamp() : deleteField()
        };
        break;
      }
      case 'edit': {
        if (action.expected && (
          (original.text || '') !== action.expected.text ||
          (original.purpose || '') !== action.expected.purpose ||
          (dueDayOf(original) || '') !== action.expected.dueDay
        )) {
          throw new Error('Цель изменилась в другой вкладке. Обновите данные перед повторным сохранением.');
        }
        patch = {
          text: validatedText(action.text, 'Название', 240),
          purpose: typeof action.purpose === 'string' ? action.purpose.trim().slice(0, 1000) : '',
          ...(action.dueDay ? dateFields(action.dueDay) : {
            dueDay: deleteField(), date: deleteField(), dueDate: deleteField()
          })
        };
        break;
      }
      case 'addSubtask': {
        const text = validatedText(action.text, 'Подзадача', 240);
        if (!action.id) throw new Error('Не удалось создать ID подзадачи.');
        if (items.some(item => item?.id === action.id)) return;
        patch = { subItems: [
          ...items.map(item => ({ ...item })),
          { id: action.id, text, completed: false }
        ] };
        break;
      }
      case 'toggleSubtask':
      case 'editSubtask':
      case 'deleteSubtask': {
        const operation = action.kind === 'toggleSubtask'
          ? { kind: 'toggle', completed: action.completed }
          : action.kind === 'editSubtask'
          ? { kind: 'edit', text: action.text }
          : { kind: 'delete' };
        patch = { subItems: nextSubtasks(items, action.target, operation) };
        break;
      }
      default:
        throw new Error('Неизвестная операция с целью.');
    }
    transaction.update(ref, patch);
  });
}

export async function removeGoal(userId, goalId) {
  if (!goalId) throw new Error('Идентификатор цели отсутствует.');
  const goalRef = doc(db, root(userId), goalId);
  // The Diary's goal event is a read-only projection of this document.
  // Deleting the document must not leave an accepted recommendation looking
  // like a live goal. Never create a second, orphanable diaryNotes record.
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(goalRef);
    if (!snapshot.exists()) return; // Retry after an already committed delete.
    const goal = snapshot.data();
    const idOk = value => typeof value === 'string' &&
      /^[A-Za-z0-9_-]{1,128}$/.test(value);
    const linked = goal?.sourceType === 'user-accepted-ai-recommendation' &&
      idOk(goal.sessionId) && idOk(goal.sourceRecommendationKey) &&
      idOk(goal.sourceAssistantMessageId);
    if (linked) {
      const sessionRef = doc(db, `artifacts/${appId}/users/${userId}/sessions`,
        goal.sessionId);
      const sessionSnapshot = await transaction.get(sessionRef);
      if (sessionSnapshot.exists()) {
        const session = sessionSnapshot.data();
        const decisions = session.recommendationDecisions;
        const previous = decisions &&
          typeof decisions === 'object' && !Array.isArray(decisions)
          ? decisions[goal.sourceRecommendationKey] : null;
        // Touch only a matching owner-scoped decision. An altered source
        // reference must never overwrite another recommendation's status.
        if (previous?.status === 'accepted' &&
            previous.goalId === goalId &&
            previous.assistantMessageId === goal.sourceAssistantMessageId) {
          transaction.update(sessionRef, {
            recommendationDecisions: {
              ...decisions,
              [goal.sourceRecommendationKey]: {
                ...previous, goalRemovedAt: serverTimestamp()
              }
            }
          });
        }
      }
    }
    transaction.delete(goalRef);
  });
}
