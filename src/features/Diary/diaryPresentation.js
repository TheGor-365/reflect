/** Pure display policy. Never present a date or an inferred headline as an AI title. */
const DATE_TITLE = /^Сеанс от\s+\d{1,2}[./]\d{1,2}[./]\d{4}/i;

export function sessionDisplayTitle(session = {}) {
  for (const value of [session.manualTitle, session.aiTitle, session.title]) {
    if (typeof value !== 'string') continue;
    const cleaned = value.trim();
    if (cleaned && !DATE_TITLE.test(cleaned)) return cleaned;
  }
  return 'Размышление с Reflect';
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
