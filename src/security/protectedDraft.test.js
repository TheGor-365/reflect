import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  discardProtectedDraft, draftStorageKey, MIN_DRAFT_PHRASE_LENGTH,
  openProtectedDraft, protectedDraftExists
} from './protectedDraft';

const uid = 'synthetic-owner';
const surface = 'diary-new';
const phrase = 'Synthetic separate draft phrase 2026!';
let entries;
let storage;

beforeEach(() => {
  entries = new Map();
  storage = {
    getItem: key => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key)
  };
});
const open = (overrides = {}) => openProtectedDraft({
  uid, surface, passphrase: phrase, storage, cryptoApi: webcrypto, ...overrides
});

describe('opt-in encrypted drafts', () => {
  it('does not create plaintext or any browser storage before the first explicit write', async () => {
    expect(MIN_DRAFT_PHRASE_LENGTH).toBe(12);
    expect(protectedDraftExists(uid, surface, storage)).toBe(false);
    const handle = await open();
    expect(handle.recovered).toBeNull();
    expect(entries.size).toBe(0);
  });

  it('encrypts multiline private text without saving the passphrase or keys', async () => {
    const handle = await open();
    await handle.write({
      title: 'Synthetic Diary', text: 'Some private synthetic thoughts\nA new line.'
    });
    const serialized = storage.getItem(draftStorageKey(uid, surface));
    expect(serialized).toContain('"v":1');
    expect(serialized).not.toContain('Some private');
    expect(serialized).not.toContain('Synthetic Diary');
    expect(serialized).not.toContain(phrase);
    const restored = await open();
    expect(restored.recovered).toEqual({
      title: 'Synthetic Diary', text: 'Some private synthetic thoughts\nA new line.'
    });
  });

  it('wrong phrase rejects recovery but preserves the original encrypted record', async () => {
    const first = await open();
    await first.write({ text: 'Private text' });
    const previous = storage.getItem(draftStorageKey(uid, surface));
    await expect(open({ passphrase: 'Some other very long phrase!' }))
      .rejects.toThrow('Фраза неверная');
    expect(storage.getItem(draftStorageKey(uid, surface))).toBe(previous);
  });

  it('prevents cross-user and cross-composer recovery', async () => {
    const first = await open();
    await first.write({ text: 'Owner-only' });
    expect(protectedDraftExists('another-owner', surface, storage)).toBe(false);
    expect(protectedDraftExists(uid, 'session-new', storage)).toBe(false);
    const other = await open({ uid: 'another-owner' });
    expect(other.recovered).toBeNull();
    const session = await open({ surface: 'session-new' });
    expect(session.recovered).toBeNull();
    expect(storage.getItem(draftStorageKey(uid, surface))).not.toBeNull();
  });

  it('rejects stale writes when another tab already changed the encrypted draft', async () => {
    const first = await open();
    const second = await open();
    await first.write({ text: 'Latest from first tab' });
    await expect(second.write({ text: 'Stale from other tab' }))
      .rejects.toThrow('другой вкладке');
    const restored = await open();
    expect(restored.recovered?.text).toBe('Latest from first tab');
  });

  it('rejects stale delete and preserves newer data', async () => {
    const first = await open();
    const second = await open();
    await second.write({ text: 'newer' });
    expect(() => first.discard()).toThrow('другой вкладке');
    expect(protectedDraftExists(uid, surface, storage)).toBe(true);
    const latest = await open();
    latest.discard();
    expect(protectedDraftExists(uid, surface, storage)).toBe(false);
  });

  it('never overwrites malformed or unsupported encrypted data', async () => {
    const key = draftStorageKey(uid, surface);
    storage.setItem(key, '{not-json');
    await expect(open()).rejects.toThrow('повреждён');
    expect(storage.getItem(key)).toBe('{not-json');
  });

  it('refuses weak phrases, bad account scopes and overlarge private text', async () => {
    await expect(open({ passphrase: 'short' })).rejects.toThrow('12 символов');
    await expect(open({ uid: '../someone' })).rejects.toThrow('владельца');
    const handle = await open();
    await expect(handle.write({ text: 'a'.repeat(200001) }))
      .rejects.toThrow('размер');
    expect(entries.size).toBe(0);
  });

  it('manual discard erases only the selected owner and draft surface', async () => {
    const first = await open();
    await first.write({ text: 'diary' });
    const second = await open({ surface: 'session-new' });
    await second.write({ text: 'session' });
    discardProtectedDraft(uid, surface, storage);
    expect(protectedDraftExists(uid, surface, storage)).toBe(false);
    expect(protectedDraftExists(uid, 'session-new', storage)).toBe(true);
  });
});
