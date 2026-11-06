import { describe, expect, it } from 'vitest';
import { auditOwnerSchema } from './schemaAudit';

const OWNER = 'privateSyntheticUidNotForDisplay';
const ROOT = 'artifacts/reflect-8fdc8/users/' + OWNER;
const d = (kind, id, fields) => ({
  path: ROOT + '/' + kind + '/' + id,
  fields
});
const envelope = docs => ({
  uid: OWNER,
  namespace: 'reflect-8fdc8',
  documents: docs
});
const ts = {
  __reflectFirestoreType: 'timestamp',
  seconds: 1794000000,
  nanoseconds: 0
};

describe('Stage 03G read-only, aggregate schema compatibility', () => {
  it('counts v1 diary notes, saved previous versions and optional profile without exposing content', () => {
    const secret = 'SENSITIVE_SYNTHETIC_CONTENT';
    const records = envelope([
      d('profiles', 'userProfile', { name: secret, age: 39, gender: 'не указан' }),
      d('diaryNotes', 'noteOne', {
        title: '',
        entries: [{
          text: secret, createdAt: ts, version: 2,
          displayTitle: 'new private title',
          versions: [{
            version: 1, title: 'old private title', text: secret, savedAt: ts
          }]
        }],
        createdAt: ts
      }),
      d('diaryNotes', 'noteTwo', {
        title: '6 ноября 2026 г.', entries: [{ text: secret, createdAt: ts }]
      }),
      d('moods', 'moodOne', { mood: 'happy', intensity: 3, comment: secret })
    ]);
    const report = auditOwnerSchema(records);
    expect(report.totals.documents).toBe(4);
    expect(report.totals.noteVersions).toBe(1);
    expect(report.totals.legacyEntries).toBe(1);
    expect(report.collectionSummary.diaryNotes.documents).toBe(2);
    expect(report.reviewedCollections).toBe(3);
    expect(report.requiresManualReview).toBe(true);
    const output = JSON.stringify(report);
    for (const privateValue of [secret, OWNER, 'new private title', 'old private title',
      'noteOne', 'noteTwo', 'createdAt']) {
      expect(output).not.toContain(privateValue);
    }
  });

  it('counts outlier fields without reporting their names or values', () => {
    const report = auditOwnerSchema(envelope([
      d('goals', 'goal1', {
        text: 'Synthetic goal', type: 'checklist', subItems: [],
        sensitiveFieldFromOldVersion: 'private synthetic value'
      }),
      d('sessions', 'session1', {
        title: 'Synthetic session', chatHistory: [], undisclosedInternalProperty: 123
      })
    ]));
    expect(report.totals.unknownFields).toBe(2);
    expect(report.totals.shapeWarnings).toBe(0);
    expect(report.requiresManualReview).toBe(true);
    expect(JSON.stringify(report)).not.toContain('sensitiveFieldFromOldVersion');
    expect(JSON.stringify(report)).not.toContain('undisclosedInternalProperty');
  });

  it('distinguishes malformed values without discarding or changing the source', () => {
    const original = envelope([
      d('diaryNotes', 'badNote', {
        title: 'normal', entries: [{ text: '', versions: [{}] }]
      }),
      d('moods', 'badMood', { mood: 'nonsense', intensity: 99 }),
      d('profiles', 'userProfile', { name: '', age: 199 })
    ]);
    const copy = structuredClone(original);
    const result = auditOwnerSchema(original);
    expect(result.totals.shapeWarnings).toBeGreaterThanOrEqual(4);
    expect(original).toEqual(copy);
  });

  it('allows an empty valid export without claiming production readiness', () => {
    const result = auditOwnerSchema(envelope([]));
    expect(result.totals.documents).toBe(0);
    expect(result.reviewedCollections).toBe(0);
    expect(result.requiresManualReview).toBe(false);
    expect(result.format).toBe('reflect-aggregate-schema-audit-v1');
  });

  it('signals document size risk without including its text in the result', () => {
    const privateLargeText = 'x'.repeat(780000);
    const report = auditOwnerSchema(envelope([
      d('diaryNotes', 'large', { title: 'Large', entries: [{ text: privateLargeText }] })
    ]));
    expect(report.totals.nearLimitDocuments).toBe(1);
    expect(report.totals.oversizedDocuments).toBe(0);
    expect(JSON.stringify(report).length).toBeLessThan(1200);
  });

  it('rejects foreign paths, unknown collection, malformed fields and oversized input arrays', () => {
    expect(() => auditOwnerSchema(envelope([
      { path: 'artifacts/foreign/users/abc/diaryNotes/id', fields: {} }
    ]))).toThrow('Неизвестное расположение');
    expect(() => auditOwnerSchema(envelope([
      { path: ROOT + '/unknown/document', fields: {} }
    ]))).toThrow('Неизвестное расположение');
    expect(() => auditOwnerSchema(envelope([
      { path: 'artifacts/reflect-8fdc8/users/anotherUid/diaryNotes/id', fields: {} }
    ]))).toThrow('Неизвестное расположение');
    expect(() => auditOwnerSchema(envelope([
      { path: ROOT + '/diaryNotes/item', fields: [] }
    ]))).toThrow('Неверная структура');
    expect(() => auditOwnerSchema({ ...envelope([]), namespace: 'another-app' }))
      .toThrow('Сначала проверьте');
    expect(() => auditOwnerSchema(envelope(new Array(10001).fill(null))))
      .toThrow('Сначала проверьте');
  });
});
