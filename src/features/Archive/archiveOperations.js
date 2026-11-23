import { deleteField, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';
import { isSupportedInteraction } from '../Sessions/interactionVersions';
import { recommendationKey } from '../Sessions/recommendationDecisions';
import { isArchivedRecord } from './archiveSelectors';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const idOk = value => typeof value === 'string' && ID.test(value);
const validOwner = userId => Boolean(db && idOk(appId) && idOk(userId));
const root = userId => `artifacts/${appId}/users/${userId}`;

/**
 * Archive one existing owner document without moving it, changing its status,
 * touching linked entities or updating chronological timestamps.
 * Its original UID-scoped Firestore path and ID remain unchanged.
 * `archived` must be an explicit boolean; there are no implicit toggles.
 */
export async function setOwnerDocumentArchived({
  userId, kind, recordId, archived
}) {
  if (!validOwner(userId) || !['sessions', 'goals'].includes(kind) ||
      !idOk(recordId) || typeof archived !== 'boolean') {
    throw new Error('Некорректные данные для архива. Изменений нет.');
  }
  const ref = doc(db, root(userId), kind, recordId);
  return runTransaction(db, async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) throw new Error('Запись больше не существует.');
    const record = snapshot.data();
    if (!record || typeof record !== 'object') {
      throw new Error('Невозможно прочитать запись.');
    }
    if (isArchivedRecord(record) === archived) return { archived, changed: false };
    tx.update(ref, { archivedAt: archived ? serverTimestamp() : deleteField() });
    return { archived, changed: true };
  });
}

/**
 * Archive only the owner's source-backed recommendation decision slot.
 * The linked goal, assistant turn, hypothesis review, and decision status are
 * untouched. A pending recommendation uses a metadata-only slot. Restoring
 * that pending slot removes it if it contains no other fields.
 */
export async function setOwnerRecommendationArchived({
  userId, sessionId, assistantMessageId, candidateIndex, archived
}) {
  if (!validOwner(userId) || !idOk(sessionId) || !idOk(assistantMessageId) ||
      !Number.isInteger(candidateIndex) || candidateIndex < 0 ||
      candidateIndex > 1 || typeof archived !== 'boolean') {
    throw new Error('Некорректная ссылка на рекомендацию.');
  }
  const key = recommendationKey(assistantMessageId, candidateIndex);
  const ref = doc(db, root(userId), 'sessions', sessionId);
  return runTransaction(db, async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) throw new Error('Исходный сеанс больше не существует.');
    const session = snapshot.data();
    if (isArchivedRecord(session)) {
      throw new Error('Исходный сеанс в архиве. Сначала восстановите его.');
    }
    const history = Array.isArray(session?.chatHistory) ? session.chatHistory : [];
    const index = history.findIndex(turn =>
      turn?.role === 'assistant' && turn.id === assistantMessageId);
    const assistant = history[index];
    const candidate = isSupportedInteraction(assistant?.interaction)
      ? assistant.interaction.recommendationCandidates?.[candidateIndex] : null;
    const source = index > 0 && history.slice(0, index).some(turn =>
      turn?.role === 'user' && idOk(turn.id));
    if (!source || !candidate || typeof candidate.title !== 'string' ||
        !candidate.title.trim() || typeof candidate.rationale !== 'string' ||
        !candidate.rationale.trim() || !Array.isArray(candidate.sourceRefs) ||
        !candidate.sourceRefs.includes('current-message')) {
      throw new Error('Рекомендация не подтверждена сохранённым диалогом.');
    }
    const decisions = session.recommendationDecisions &&
      typeof session.recommendationDecisions === 'object' &&
      !Array.isArray(session.recommendationDecisions)
      ? session.recommendationDecisions : {};
    const prior = Object.hasOwn(decisions, key) ? decisions[key] : null;
    if (prior != null && (typeof prior !== 'object' || Array.isArray(prior))) {
      throw new Error('Повреждённая запись решения. Архив не изменён.');
    }
    const old = prior || {};
    if (isArchivedRecord(old) === archived) return { archived, changed: false };
    const next = { ...decisions };
    if (archived) {
      next[key] = { ...old, archivedAt: serverTimestamp() };
    } else {
      const restored = { ...old };
      delete restored.archivedAt;
      if (Object.keys(restored).length) next[key] = restored;
      else delete next[key];
    }
    // This full-map update is protected by an owner-scoped transaction read.
    tx.update(ref, { recommendationDecisions: next });
    return { archived, changed: true };
  });
}
