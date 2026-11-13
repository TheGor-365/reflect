/**
 * Local, zero-cost editorial label built only from the first authored turn.
 * Not an AI inference; never reads other sessions, diary or user profile.
 * Explicit user-supplied and approved AI titles always take precedence in UI.
 */
const FALLBACK = 'Размышление с Reflect';
const MAX_TITLE_LENGTH = 76;
const DATE_TITLE = /^(?:Сеанс(?:\s+от|\s*[·:–-])|\d{1,2}[./]\d{1,2}[./]\d{4})/i;
const MAIL = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g;
const LINK = /https?:\/\/\S+|www\.\S+/gi;
const PHONE = /(?:\+?\d[\d\s()\-]{8,}\d)/g;

export function isAutomaticSessionTitle(value) {
  return typeof value === 'string' &&
    (!value.trim() || DATE_TITLE.test(value.trim()));
}
function trimWords(source, max = MAX_TITLE_LENGTH) {
  const text = source.trim().replace(/[\s:;,.!?—-]+$/u, '').trim();
  if (text.length <= max) return text;
  const clipped = text.slice(0, max - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return (lastSpace >= 25 ? clipped.slice(0, lastSpace) : clipped).trim() + '…';
}
export function deriveSessionTitle(message) {
  if (typeof message !== 'string') return FALLBACK;
  // Never place direct links, contact info or unescaped markup into a label.
  const clean = message.replace(LINK, ' ').replace(MAIL, ' ')
    .replace(PHONE, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean || !/[А-Яа-яЁёA-Za-z]{3}/.test(clean)) return FALLBACK;
  const text = clean.slice(0, 500);
  const has = re => re.test(text);

  // Grounded headline templates only when BOTH the topic and problem are
  // explicit in the first turn. No clinical labels or inferred motivation.
  if (has(/(?:откладыва|отложил|отложила|затягива|не могу).*?(?:запуск|публикац)|(?:запуск|публикац).*?(?:откладыва|затягива)/i) &&
      has(/веб-приложен|приложен|веб-проект|сайт|проект|продукт/i)) {
    return has(/веб-приложен|приложен/i)
      ? 'Откладываю запуск веб-приложения'
      : 'Откладываю запуск проекта';
  }
  if (has(/записыва\w*\s+(?:свои\s+)?мысл|вести\s+дневник/i)) {
    return 'Зачем записывать мысли';
  }
  if (has(/(?:решить|выбрать|выбор|сомневаюсь|стоит ли).*?(?:работ|професси|карьер)/i) ||
      has(/(?:работ|професси|карьер).*?(?:выбрать|менять|сменить)/i)) {
    return 'Выбор в работе и карьере';
  }
  if (has(/\b(?:mvp|мвп)\b/i) && has(/запуск|выпустить|показать|завершить/i)) {
    return 'План запуска MVP';
  }

  // Safe general fallback: headline is an extract, not a hallucinated label.
  const clause = clean.split(/[.!?\n]/u)[0].trim();
  const sentence = clause.replace(/^(?:Здравствуйте[,!]?\s*|Привет[,!]?\s*)/i, '')
    .replace(/^(?:Я\s+хочу\s+|Мне\s+нужно\s+|Помоги\s+мне\s+)/i, '')
    .trim();
  return trimWords(sentence || clause) || FALLBACK;
}
