import { describe, expect, it } from 'vitest';
import { MOOD_LABELS, summarizeMoods } from './moodInsights';

const at = (year: number, month: number, day: number, hour = 12) => ({
  toDate: () => new Date(year, month - 1, day, hour)
});
const now = new Date(2026, 10, 6, 12);

describe('descriptive mood summaries', () => {
  it('uses exactly seven local calendar days, not UTC hour boundaries', () => {
    const records = [
      { mood: 'happy', intensity: 3, createdAt: at(2026, 10, 31, 22) },
      { mood: 'content', intensity: 4, createdAt: at(2026, 11, 1, 0) },
      { mood: 'neutral', intensity: 2, createdAt: at(2026, 11, 6, 23) },
      { mood: 'sad', intensity: 1, createdAt: at(2026, 10, 30, 23) },
      { mood: 'anxious', intensity: 5, createdAt: at(2026, 11, 7, 0) }
    ];
    const report = summarizeMoods(records, now);
    expect(report.since).toBe('2026-10-31');
    expect(report.through).toBe('2026-11-06');
    expect(report.days).toHaveLength(7);
    expect(report.total).toBe(3);
    expect(report.categories.find(entry => entry.key === 'sad')?.count).toBe(0);
    expect(report.observedDays).toBe(3);
    expect(report.noReportsDays).toBe(4);
  });

  it('counts multiple reports on a day without inventing missing observations', () => {
    const report = summarizeMoods([
      { mood: 'happy', intensity: 5, createdAt: at(2026, 11, 5) },
      { mood: 'sad', intensity: 1, createdAt: at(2026, 11, 5) }
    ], now);
    expect(report.total).toBe(2);
    expect(report.observedDays).toBe(1);
    expect(report.noReportsDays).toBe(6);
    expect(report.days.find(day => day.day === '2026-11-05')?.total).toBe(2);
    expect(report.averageIntensity).toBe(3);
  });

  it('does not fabricate an intensity average for an empty window', () => {
    const report = summarizeMoods([], now);
    expect(report.total).toBe(0);
    expect(report.averageIntensity).toBeNull();
    expect(report.withValidIntensity).toBe(0);
    expect(report.noReportsDays).toBe(7);
    expect(report.categories.every(item => item.count === 0)).toBe(true);
  });

  it('uses only valid integer intensities and reports the exact denominator', () => {
    const report = summarizeMoods([
      { mood: 'happy', intensity: 3, createdAt: at(2026, 11, 6) },
      { mood: 'happy', intensity: 9, createdAt: at(2026, 11, 6) },
      { mood: 'content', intensity: '4', createdAt: at(2026, 11, 6) },
      { mood: 'sad', createdAt: at(2026, 11, 6) }
    ], now);
    expect(report.total).toBe(4);
    expect(report.withValidIntensity).toBe(1);
    expect(report.invalidIntensityCount).toBe(3);
    expect(report.averageIntensity).toBe(3);
  });

  it('distinguishes undated records from dated unknown mood categories', () => {
    const report = summarizeMoods([
      { mood: 'another', intensity: 3, createdAt: at(2026, 11, 6) },
      { mood: 'happy', intensity: 5 },
      { mood: 'happy', createdAt: { toDate: () => { throw new Error('unknown'); } } }
    ], now);
    expect(report.total).toBe(1);
    expect(report.unknownCategory).toBe(1);
    expect(report.undatedCount).toBe(2);
    expect(report.withValidIntensity).toBe(1);
  });

  it('preserves frozen Firestore records and never examines private note content', () => {
    const record = Object.freeze({
      mood: 'anxious', intensity: 2, comment: 'Not for analytics', createdAt: at(2026, 11, 6)
    });
    const collection = Object.freeze([record]);
    const result = summarizeMoods(collection, now);
    expect(result.total).toBe(1);
    expect(record.comment).toBe('Not for analytics');
    expect(JSON.stringify(result)).not.toContain('Not for analytics');
    expect(MOOD_LABELS.anxious).toBe('Тревога');
  });

  it('handles damaged and null source records without crashing', () => {
    const values: unknown[] = [null, '', 3, {}, [], {
      mood: 'happy', intensity: 4, createdAt: { toDate: () => null }
    }];
    const result = summarizeMoods(values, now);
    expect(result.total).toBe(0);
    expect(result.undatedCount).toBe(2);
  });

  it('accepts Firestore timestamp-like objects without changing their dates', () => {
    const date = new Date(2026, 10, 6, 12);
    const record = { mood: 'neutral', intensity: 1, createdAt: { toDate: () => date } };
    const report = summarizeMoods([record], now);
    expect(report.total).toBe(1);
    expect(date.getTime()).toBe(new Date(2026, 10, 6, 12).getTime());
  });
});
