import { describe, expect, it } from 'vitest';
import { isReflectEntryPath } from './entryRoute';

describe('Reflect entry route guard', () => {
  it('allows only the legacy single-page root and index', () => {
    expect(isReflectEntryPath('/')).toBe(true);
    expect(isReflectEntryPath('/index.html')).toBe(true);
  });
  it('preserves the historic ChatGPT campaign-path link', () => {
    expect(isReflectEntryPath('/utm_source=chatgpt.com')).toBe(true);
    expect(isReflectEntryPath('/utm_medium=referral')).toBe(true);
  });
  it('rejects unsupported paths to show a branded 404', () => {
    expect(isReflectEntryPath('/missing')).toBe(false);
    expect(isReflectEntryPath('/settings/delete')).toBe(false);
    expect(isReflectEntryPath('/utm_source=bad/value')).toBe(false);
    expect(isReflectEntryPath('/utm_source=')).toBe(false);
  });
});
