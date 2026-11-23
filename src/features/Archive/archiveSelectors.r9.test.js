import { describe, expect, it } from 'vitest';
import { isArchivedRecord, partitionArchivedRecords,
  isArchivedRecommendation } from './archiveSelectors';

describe('R9.2.4 archive projection', () => {
  it('legacy records stay active without migration', () => {
    expect(isArchivedRecord({ id: 'legacy-1' })).toBe(false);
    expect(isArchivedRecord({ archivedAt: null })).toBe(false);
    expect(isArchivedRecord({ archivedAt: { seconds: 42 } })).toBe(true);
  });
  it('partitions without mutating source records or their links', () => {
    const original = Object.freeze({ id: 'one', chatHistory: ['original'] });
    const hidden = Object.freeze({ id: 'two', archivedAt: { seconds: 42 },
      sourceRecommendationKey: 'r-answer-0' });
    const input = Object.freeze([original, hidden]);
    expect(partitionArchivedRecords(input)).toEqual({
      active: [original], archived: [hidden]
    });
    expect(input).toHaveLength(2);
  });
  it('recommendations use independent archivedAt, not status=archived', () => {
    expect(isArchivedRecommendation({ status: 'accepted', archivedAt: { seconds: 9 } }))
      .toBe(true);
    expect(isArchivedRecommendation({ status: 'dismissed' })).toBe(false);
  });
});
