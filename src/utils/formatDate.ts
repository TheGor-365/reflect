import type { DateConvertible } from '../types/reflect';

/**
 * Format a Firestore Timestamp-like value in Russian, preserving legacy
 * output and returning an empty string for an absent/unreadable timestamp.
 * This is a pure display utility: no Firestore writes or schema conversion.
 */
export const formatDate = (timestamp: DateConvertible | null | undefined): string => {
  if (!timestamp || typeof timestamp.toDate !== 'function') return '';
  const date = timestamp.toDate();
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  const formatted = new Intl.DateTimeFormat('ru-RU', options).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};
