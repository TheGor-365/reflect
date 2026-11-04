import { describe, expect, it } from 'vitest';
import { formatDate } from './formatDate';

describe('formatDate — legacy Russian Firestore date rendering', () => {
  it('does not display missing Firestore server timestamps', () => {
    expect(formatDate(undefined)).toBe('');
    expect(formatDate(null)).toBe('');
  });

  it('formats a valid Timestamp-like object exactly as before migration', () => {
    const date = new Date('2026-11-04T12:34:00.000Z');
    const expected = new Intl.DateTimeFormat('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
    expect(formatDate({ toDate: () => date })).toBe(
      expected.charAt(0).toUpperCase() + expected.slice(1)
    );
  });

  it('rejects a missing toDate method at runtime without throwing', () => {
    // Historic imported JSON data may not contain a Firebase Timestamp.
    expect(formatDate({} as { toDate(): Date })).toBe('');
  });
});
