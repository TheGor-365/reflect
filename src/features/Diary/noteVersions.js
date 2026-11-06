import { doc, runTransaction, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';

// Older diary notes got a Russian date as an automatic title. Preserve the
// stored value but do not mistake it for an author-written heading.
const AUTO_DATE_TITLE = /^\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}\s*г?\.?$/i;
const MAX_NOTE_BYTES_ESTIMATE = 800000;

export function authoredTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  return AUTO_DATE_TITLE.test(title) ? '' : title;
}

export function entryTitle(note, item) {
  const raw = item && Object.prototype.hasOwnProperty.call(item, 'displayTitle')
    ? item.displayTitle : note?.title;
  return authoredTitle(raw);
}

export function entryVersion(item) {
  return Number.isSafeInteger(item?.version) && item.version >= 1 ? item.version : 1;
}

export function entryVersions(note, item) {
  const prior = Array.isArray(item?.versions) ? item.versions.filter(
    record => record && typeof record === 'object' && typeof record.text === 'string'
  ) : [];
  return [
    ...prior.map((version, index) => ({
      version: Number.isSafeInteger(version.version) ? version.version : index + 1,
      title: authoredTitle(version.title),
      text: version.text,
      at: version.savedAt || null,
      current: false
    })),
    {
      version: entryVersion(item),
      title: entryTitle(note, item),
      text: typeof item?.text === 'string' ? item.text : '',
      at: item?.editedAt || item?.createdAt || null,
      current: true
    }
  ];
}

/**
 * The existing entries remain intact; each changed version keeps the exact
 * previous text/title. No history truncation occurs before the Firestore
 * document limit: the edit fails safely instead.
 */
export function planNoteRevision(note, {
  entryIndex, title, text, expectedVersion, editId, savedAt
}) {
  if (!note || !Array.isArray(note.entries) ||
      !Number.isInteger(entryIndex) || entryIndex < 0 || entryIndex >= note.entries.length) {
    throw new Error('Запись не найдена. Обновите дневник перед редактированием.');
  }
  if (typeof text !== 'string' || !text.trim() || text.length > 20000 ||
      typeof title !== 'string' || title.length > 240) {
    throw new Error('Текст должен содержать от 1 до 20 000 символов, заголовок — до 240.');
  }
  if (typeof editId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(editId)) {
    throw new Error('Не удалось создать идентификатор редактирования.');
  }
  const previous = note.entries[entryIndex];
  if (!previous || typeof previous.text !== 'string') {
    throw new Error('Исходный текст недоступен. Ничего не изменено.');
  }
  const nextText = text.trim();
  const nextTitle = title.trim();
  const oldTitle = entryTitle(note, previous);
  const currentVersion = entryVersion(previous);

  // Ambiguous network retry after a confirmed commit must not generate an
  // extra identical version.
  if (previous.lastEditId === editId) {
    if (previous.text === nextText && entryTitle(note, previous) === authoredTitle(nextTitle)) {
      return { note, alreadyApplied: true, changed: false };
    }
    throw new Error('Запись уже изменилась. Обновите её перед повторной правкой.');
  }

  if (currentVersion !== expectedVersion) {
    throw new Error('Запись уже изменена в другом окне. Обновите страницу, чтобы не потерять правки.');
  }
  if (previous.text === nextText && oldTitle === authoredTitle(nextTitle)) {
    return { note, alreadyApplied: false, changed: false };
  }
  const history = Array.isArray(previous.versions) ? previous.versions : [];
  const updatedEntry = {
    ...previous,
    text: nextText,
    displayTitle: nextTitle,
    version: currentVersion + 1,
    lastEditId: editId,
    editedAt: savedAt,
    versions: [...history, {
      version: currentVersion,
      text: previous.text,
      title: oldTitle,
      savedAt
    }]
  };
  const entries = [...note.entries];
  entries[entryIndex] = updatedEntry;
  const next = { ...note, entries };
  if (JSON.stringify({ title: next.title, entries }).length > MAX_NOTE_BYTES_ESTIMATE) {
    throw new Error('Достигнут лимит истории этой записи. Сохраните отдельную заметку; версии не удалены.');
  }
  return { note: next, alreadyApplied: false, changed: true };
}

export async function saveNoteRevision({
  userId, noteId, entryIndex, title, text, expectedVersion, editId
}) {
  if (!db || !userId || !noteId) {
    throw new Error('Нет подключения к личному дневнику. Изменения не отправлены.');
  }
  const noteRef = doc(db, 'artifacts/' + appId + '/users/' + userId + '/diaryNotes', noteId);
  let confirmed;
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(noteRef);
    if (!snapshot.exists()) {
      throw new Error('Заметка отсутствует. Ничего не перезаписано.');
    }
    const original = snapshot.data();
    const result = planNoteRevision(original, {
      entryIndex, title, text, expectedVersion, editId, savedAt: Timestamp.now()
    });
    if (result.changed) {
      transaction.update(noteRef, {
        entries: result.note.entries,
        updatedAt: serverTimestamp()
      });
    }
    confirmed = { ...result.note, id: noteId };
  });
  return confirmed;
}
