import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyAuthEmailLocale, resolveEmailLocale, REFLECT_LOCALE_STORAGE_KEY
} from './authEmailLocale';

afterEach(() => {
  window.localStorage.removeItem(REFLECT_LOCALE_STORAGE_KEY);
  vi.restoreAllMocks();
});

describe('language for Firebase account emails', () => {
  it('defaults to Russian until UI language choice is available', () => {
    expect(resolveEmailLocale(undefined)).toBe('ru');
    const auth = { languageCode: null };
    expect(applyAuthEmailLocale(auth)).toBe('ru');
    expect(auth.languageCode).toBe('ru');
  });

  it('uses the user-selected application language, not IP or browser region', () => {
    window.localStorage.setItem(REFLECT_LOCALE_STORAGE_KEY, 'en-US');
    const auth = { languageCode: 'ru' };
    expect(applyAuthEmailLocale(auth)).toBe('en-us');
    expect(auth.languageCode).toBe('en-us');
  });

  it('prefers an explicit future account locale over the device setting', () => {
    window.localStorage.setItem(REFLECT_LOCALE_STORAGE_KEY, 'en');
    const auth = { languageCode: 'ru' };
    expect(applyAuthEmailLocale(auth, 'fr')).toBe('fr');
  });

  it('rejects malformed preferences and falls back to Russian', () => {
    window.localStorage.setItem(REFLECT_LOCALE_STORAGE_KEY, '<script>');
    expect(applyAuthEmailLocale({ languageCode: null })).toBe('ru');
    expect(resolveEmailLocale('')).toBe('ru');
    expect(resolveEmailLocale('unknown_locale')).toBe('ru');
  });

  it('does not crash when browser storage is inaccessible', () => {
    const storage = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
      () => { throw new Error('Storage denied'); }
    );
    expect(applyAuthEmailLocale({ languageCode: null })).toBe('ru');
    expect(storage).toHaveBeenCalledWith(REFLECT_LOCALE_STORAGE_KEY);
    storage.mockRestore();
  });
});
