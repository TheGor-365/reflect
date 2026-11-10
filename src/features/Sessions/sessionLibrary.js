import { sessionDisplayTitle, sessionExcerpt } from '../Diary/diaryPresentation';

// Read-only presentation helpers. No user writes, model calls or synthetic visits.
export function readableSessionDate(value) {
  try {
    let date = null;
    if (value instanceof Date) date = value;
    else if (value && typeof value.toDate === 'function') date = value.toDate();
    else if (value && Number.isFinite(value.seconds)) date = new Date(value.seconds * 1000);
    else if (typeof value === 'string' && value.trim()) date = new Date(value);
    else if (typeof value === 'number' && Number.isFinite(value)) date = new Date(value);
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

export function buildSessionLibrary(sessions = []) {
  if (!Array.isArray(sessions)) return [];
  return sessions
    .filter(item => item && typeof item.id === 'string' && item.id.length > 0)
    .map((session, index) => {
      const excerpt = sessionExcerpt(session);
      const validTurns = excerpt.history.filter(m =>
        (m?.role === 'user' || m?.role === 'assistant') &&
        typeof m.content === 'string' && m.content.trim()
      );
      const answerCount = validTurns.filter(m => m.role === 'assistant').length;
      const times = [
        session.updatedAt, session.createdAt,
        ...validTurns.map(m => m.timestamp)
      ].map(readableSessionDate).filter(Boolean);
      const latest = times.length ? new Date(Math.max(...times.map(t => t.getTime()))) : null;
      return {
        id: session.id,
        title: sessionDisplayTitle(session),
        question: excerpt.question,
        reflection: excerpt.reflection,
        messageCount: validTurns.length,
        answerCount,
        latest,
        dateLabel: latest ? new Intl.DateTimeFormat('ru-RU', {
          day: 'numeric', month: 'long', year: 'numeric'
        }).format(latest) : 'Дата не указана',
        _index: index
      };
    })
    .sort((a, b) => (b.latest?.getTime() ?? -1) -
      (a.latest?.getTime() ?? -1) || a._index - b._index);
}

export function searchSessionLibrary(items, query, filter = 'all') {
  const needle = typeof query === 'string' ? query.trim().toLocaleLowerCase('ru') : '';
  return items.filter(item => {
    if (filter === 'with-answer' && !item.answerCount) return false;
    if (filter === 'without-answer' && item.answerCount) return false;
    return !needle || [item.title, item.question, item.reflection].some(value =>
      value?.toLocaleLowerCase('ru').includes(needle));
  });
}
