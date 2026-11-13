/** Pure display policy. Local source extracts are not AI assertions. */
import { deriveSessionTitle, isAutomaticSessionTitle } from '../Sessions/sessionTitle';

export function sessionDisplayTitle(session = {}) {
  // Explicit user rename always wins, including over any approved AI title.
  const manual = typeof session.manualTitle === 'string' && session.manualTitle.trim()
    ? session.manualTitle.trim()
    : session.titleSource === 'user' && typeof session.title === 'string'
      ? session.title.trim() : '';
  if (manual) return manual;
  if (typeof session.aiTitle === 'string' && session.aiTitle.trim() &&
      !isAutomaticSessionTitle(session.aiTitle)) {
    return session.aiTitle.trim();
  }
  if (typeof session.title === 'string' && session.title.trim() &&
      !isAutomaticSessionTitle(session.title)) {
    return session.title.trim();
  }
  // No migration/write, no extra AI usage. The authenticated owner's first
  // authored turn provides the entire provenance of the displayed label.
  const first = Array.isArray(session.chatHistory)
    ? session.chatHistory.find(turn => turn?.role === 'user' &&
        typeof turn.content === 'string' && turn.content.trim()) : null;
  return deriveSessionTitle(first?.content);
}

export function sessionExcerpt(session = {}) {
  const history = Array.isArray(session.chatHistory) ? session.chatHistory : [];
  const assistant = history.filter(msg =>
    msg?.role === 'assistant' && typeof msg.content === 'string' && msg.content.trim()
  ).at(-1);
  const user = history.find(msg =>
    msg?.role === 'user' && typeof msg.content === 'string' && msg.content.trim()
  );
  return {
    reflection: assistant?.content?.trim() || '',
    question: user?.content?.trim() || '',
    count: history.length,
    history
  };
}

export function timelineCalendarLabel(groupKey, kind = 'day') {
  if (groupKey === 'undated') return 'Без даты';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(groupKey)) return 'Без даты';
  const [year, month, day] = groupKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day) return 'Без даты';
  const options = kind === 'month'
    ? { month: 'long', year: 'numeric', timeZone: 'UTC' }
    : { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' };
  const text = new Intl.DateTimeFormat('ru-RU', options).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
