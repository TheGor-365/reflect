/** R9.2.4 — archive metadata is presentation state, never a delete. */
export const isArchivedRecord = record =>
  record != null && typeof record === 'object' &&
  record.archivedAt !== undefined && record.archivedAt !== null;

export function partitionArchivedRecords(records = []) {
  const active = [], archived = [];
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || typeof record !== 'object') continue;
    (isArchivedRecord(record) ? archived : active).push(record);
  }
  return { active, archived };
}

/** Recommendation projection rows carry archive state from session decisions. */
// A recommendation can remain unarchived itself while its source session is
// archived. That is an effective read-only/archive state, not a cascade write.
export const isArchivedRecommendation = row =>
  isArchivedRecord(row) || row?.sourceSessionArchived === true;
