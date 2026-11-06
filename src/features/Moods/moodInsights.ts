import { localCalendarKey, timestampDate } from '../Diary/diaryTimeline';

export type MoodKey = 'happy' | 'content' | 'neutral' | 'sad' | 'anxious';

export const MOOD_LABELS: Readonly<Record<MoodKey, string>> = {
  happy: 'Радость',
  content: 'Спокойствие',
  neutral: 'Нейтрально',
  sad: 'Грусть',
  anxious: 'Тревога'
};

export const MOOD_SYMBOLS: Readonly<Record<MoodKey, string>> = {
  happy: '😊', content: '😌', neutral: '😐', sad: '😟', anxious: '😰'
};

const knownMood = (value: unknown): value is MoodKey =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(MOOD_LABELS, value);

export interface MoodDay {
  day: string;
  total: number;
  counts: Record<MoodKey, number>;
}

export interface MoodInsightsSummary {
  since: string;
  through: string;
  days: MoodDay[];
  total: number;
  withValidIntensity: number;
  averageIntensity: number | null;
  unknownCategory: number;
  undatedCount: number;
  invalidIntensityCount: number;
  categories: Array<{ key: MoodKey; label: string; count: number }>;
  // Report distribution rather than guessing a diagnostic severity, score,
  // or treating missing days as days of "neutral" mood.
  observedDays: number;
  noReportsDays: number;
}

const newCounts = (): Record<MoodKey, number> => ({
  happy: 0, content: 0, neutral: 0, sad: 0, anxious: 0
});

function calendarKeyNow(date: Date): string {
  return localCalendarKey(date);
}

/** Calendar-day arithmetic anchored at UTC noon avoids DST midnight shifts. */
function addDays(key: string, increment: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!, 12));
  date.setUTCDate(date.getUTCDate() + increment);
  return date.toISOString().slice(0, 10);
}

function hasIntensity(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function summarizeMoods(
  records: readonly unknown[] | null | undefined,
  now: Date = new Date()
): MoodInsightsSummary {
  if (!Number.isFinite(now.getTime())) {
    throw new Error('Не удалось определить текущую дату для анализа.');
  }
  const through = calendarKeyNow(now);
  const since = addDays(through, -6);
  const days: MoodDay[] = Array.from({ length: 7 }, (_, i) => ({
    day: addDays(since, i), total: 0, counts: newCounts()
  }));
  const indexed = new Map(days.map(day => [day.day, day]));
  const counts = newCounts();
  let total = 0, unknownCategory = 0, undatedCount = 0;
  let withValidIntensity = 0, invalidIntensityCount = 0, intensitySum = 0;

  for (const raw of Array.isArray(records) ? records : []) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const date = timestampDate(record.createdAt);
    if (!date) {
      undatedCount++;
      continue;
    }
    const day = calendarKeyNow(date);
    const daySummary = indexed.get(day);
    if (!daySummary) continue;
    daySummary.total++;
    total++;
    if (knownMood(record.mood)) {
      counts[record.mood]++;
      daySummary.counts[record.mood]++;
    } else {
      unknownCategory++;
    }
    if (hasIntensity(record.intensity)) {
      withValidIntensity++;
      intensitySum += record.intensity;
    } else {
      invalidIntensityCount++;
    }
  }

  const categories = (Object.keys(MOOD_LABELS) as MoodKey[])
    .map(key => ({ key, label: MOOD_LABELS[key], count: counts[key] }));
  const observedDays = days.filter(day => day.total > 0).length;
  return {
    since, through, days, total, categories,
    observedDays, noReportsDays: days.length - observedDays,
    unknownCategory, undatedCount, withValidIntensity, invalidIntensityCount,
    averageIntensity: withValidIntensity
      ? Math.round((intensitySum / withValidIntensity) * 10) / 10 : null
  };
}
