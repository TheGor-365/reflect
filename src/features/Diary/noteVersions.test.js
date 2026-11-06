import { describe, it, expect, vi, beforeEach } from 'vitest';
import { doc, runTransaction } from 'firebase/firestore';
import {
  authoredTitle, entryTitle, entryVersion, entryVersions,
  planNoteRevision, saveNoteRevision
} from './noteVersions';

vi.mock('../../firebase/config', () => ({ db: { synthetic: true }, appId: 'reflect-8fdc8' }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...paths) => ({ path: paths.join('/') })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ kind: 'serverTimestamp' })),
  Timestamp: { now: vi.fn(() => ({ kind: 'timestamp' })) }
}));

const at = { toDate: () => new Date('2026-11-06T18:00:00Z') };
const baseNote = () => ({
  id: 'journal-1',
  title: '6 ноября 2026 г.',
  createdAt: at,
  entries: [
    { text: 'Первая версия', createdAt: at },
    { text: 'Вторая, отдельная запись', createdAt: at }
  ]
});
const req = overrides => ({
  entryIndex: 0, title: 'Мой заголовок',
  text: 'Исправленная версия', expectedVersion: 1,
  editId: 'rev-synthetic-0001', savedAt: { kind: 'now' }, ...overrides
});

beforeEach(() => { vi.clearAllMocks(); });

describe('versioned user-authored journal entries', () => {
  it('hides historic auto-generated date headings without changing stored data', () => {
    const note = baseNote();
    expect(entryTitle(note, note.entries[0])).toBe('');
    expect(authoredTitle(note.title)).toBe('');
    expect(authoredTitle('Настоящий заголовок')).toBe('Настоящий заголовок');
    expect(note.title).toBe('6 ноября 2026 г.');
  });

  it('only edits selected entry and preserves exactly one immutable previous version', () => {
    const original = baseNote();
    const plan = planNoteRevision(original, req());
    expect(plan.changed).toBe(true);
    expect(original.entries[0].text).toBe('Первая версия');
    expect(plan.note.entries[1]).toEqual(original.entries[1]);
    expect(plan.note.title).toBe(original.title);
    expect(plan.note.entries[0]).toEqual(expect.objectContaining({
      text: 'Исправленная версия', displayTitle: 'Мой заголовок',
      version: 2, lastEditId: 'rev-synthetic-0001'
    }));
    expect(plan.note.entries[0].versions).toEqual([expect.objectContaining({
      version: 1, text: 'Первая версия', title: '',
      savedAt: at
    })]);
    expect(entryVersions(plan.note, plan.note.entries[0])).toEqual([
      expect.objectContaining({ version: 1, text: 'Первая версия', current: false }),
      expect.objectContaining({ version: 2, text: 'Исправленная версия', current: true })
    ]);
  });

  it('keeps all versions over repeated edits and supports title-only edits', () => {
    const first = planNoteRevision(baseNote(), req()).note;
    const second = planNoteRevision(first, req({
      expectedVersion: 2, editId: 'rev-synthetic-0002',
      title: 'Заголовок 2', text: 'Исправленная версия'
    })).note;
    expect(second.entries[0].versions).toHaveLength(2);
    expect(second.entries[0].versions.map(x => x.version)).toEqual([1, 2]);
    expect(second.entries[0].versions[0].text).toBe('Первая версия');
    expect(second.entries[0].versions[1].title).toBe('Мой заголовок');
    expect(second.entries[0].version).toBe(3);
    expect(entryTitle(second, second.entries[0])).toBe('Заголовок 2');
  });

  it('a retried already-applied edit is idempotent; stale conflicting writes fail closed', () => {
    const first = planNoteRevision(baseNote(), req()).note;
    const again = planNoteRevision(first, req());
    expect(again.alreadyApplied).toBe(true);
    expect(again.changed).toBe(false);
    expect(again.note.entries[0].versions).toHaveLength(1);
    expect(() => planNoteRevision(first, req({
      editId: 'rev-synthetic-another', text: 'Несогласованная правка'
    }))).toThrow('другом окне');
    expect(first.entries[0].text).toBe('Исправленная версия');
  });

  it('rejects invalid indexes, empty text and overlarge history rather than truncating', () => {
    expect(() => planNoteRevision(baseNote(), req({ entryIndex: 99 }))).toThrow('не найдена');
    expect(() => planNoteRevision(baseNote(), req({ text: ' ' }))).toThrow('Текст должен');
    const huge = baseNote();
    huge.entries[0].versions = [{ text: 'а'.repeat(430000), title: '' }];
    expect(() => planNoteRevision(huge, req())).toThrow('лимит истории');
    expect(huge.entries[0].versions).toHaveLength(1);
  });

  it('Firestore transaction updates only the owned note and keeps the other entries', async () => {
    const transaction = {
      get: vi.fn(async () => ({ exists: () => true, data: () => baseNote() })),
      update: vi.fn()
    };
    runTransaction.mockImplementation(async (_db, callback) => callback(transaction));
    const result = await saveNoteRevision({
      userId: 'synthetic-owner', noteId: 'journal-1', ...req()
    });
    expect(doc).toHaveBeenCalledWith(expect.anything(),
      'artifacts/reflect-8fdc8/users/synthetic-owner/diaryNotes', 'journal-1');
    expect(transaction.update).toHaveBeenCalledOnce();
    const update = transaction.update.mock.calls[0][1];
    expect(update.entries[0].versions).toHaveLength(1);
    expect(update.entries[1].text).toBe('Вторая, отдельная запись');
    expect(result.entries[0].version).toBe(2);
  });

  it('transaction refuses deleted documents without rewriting anything', async () => {
    const transaction = {
      get: vi.fn(async () => ({ exists: () => false })),
      update: vi.fn()
    };
    runTransaction.mockImplementation(async (_db, cb) => cb(transaction));
    await expect(saveNoteRevision({
      userId: 'synthetic-owner', noteId: 'missing', ...req()
    })).rejects.toThrow('отсутствует');
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('a legacy note without a version field is treated as original v1', () => {
    const note = baseNote();
    expect(entryVersion(note.entries[0])).toBe(1);
    expect(entryVersions(note, note.entries[0])).toEqual([
      expect.objectContaining({ version: 1, current: true, text: 'Первая версия' })
    ]);
  });
});
