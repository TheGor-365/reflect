import { describe, expect, it } from 'vitest';
import {
  AI_SETTINGS_DEFAULTS, parseAiSettings, settingsEqual, updateAiPreference
} from './aiSettingsModel';

describe('account-scoped AI preference model (not a source grant)', () => {
  it('defaults to no recommendations, no autosave and no memory access field', () => {
    expect(AI_SETTINGS_DEFAULTS.recommendationsEnabled).toBe(false);
    expect(AI_SETTINGS_DEFAULTS.autoSaveRecommendations).toBe(false);
    expect(Object.hasOwn(AI_SETTINGS_DEFAULTS, 'includeAllHistory')).toBe(false);
    expect(parseAiSettings(undefined)).toBeNull();
    expect(parseAiSettings({})).toBeNull();
  });
  it('does not carry unrecognized fields or client-granted history scopes', () => {
    const data = parseAiSettings({
      ...AI_SETTINGS_DEFAULTS, providerToken: 'private-token',
      accessAllHistory: true
    });
    expect(data).toEqual(AI_SETTINGS_DEFAULTS);
    expect(JSON.stringify(data)).not.toContain('private-token');
  });
  it('rejects corrupted preference values and contradictory recommendation flags', () => {
    expect(parseAiSettings({ ...AI_SETTINGS_DEFAULTS, schemaVersion: 99 })).toBeNull();
    expect(parseAiSettings({ ...AI_SETTINGS_DEFAULTS, responseTone: 'god-mode' })).toBeNull();
    expect(parseAiSettings({ ...AI_SETTINGS_DEFAULTS,
      autoSaveRecommendations: true })).toBeNull();
    expect(parseAiSettings({ ...AI_SETTINGS_DEFAULTS,
      showContextIndicator: 'true' })).toBeNull();
  });
  it('turning recommendations off also clears autosave', () => {
    const on = updateAiPreference(AI_SETTINGS_DEFAULTS, 'recommendationsEnabled', true);
    const saving = updateAiPreference(on, 'autoSaveRecommendations', true);
    const off = updateAiPreference(saving, 'recommendationsEnabled', false);
    expect(off.recommendationsEnabled).toBe(false);
    expect(off.autoSaveRecommendations).toBe(false);
    expect(updateAiPreference(off, 'autoSaveRecommendations', true)).toEqual(off);
  });
  it('does not mutate or carry arbitrary settings', () => {
    expect(updateAiPreference(AI_SETTINGS_DEFAULTS, 'providerKey', 'abc'))
      .toBe(AI_SETTINGS_DEFAULTS);
    expect(AI_SETTINGS_DEFAULTS.recommendationsEnabled).toBe(false);
    expect(settingsEqual(AI_SETTINGS_DEFAULTS, { ...AI_SETTINGS_DEFAULTS,
      updatedAt: 'ignored-metadata' })).toBe(true);
  });
});

it('legacy Eric settings get opt-in persona defaults without changing permission flags',()=>{
  const legacy={
    schemaVersion:1,responseDepth:'deep',responseTone:'supportive',
    askClarifyingQuestions:true,recommendationsEnabled:true,
    autoSaveRecommendations:false,recommendationFrequency:'rare',
    showContextIndicator:false
  };
  const parsed=parseAiSettings(legacy);
  expect(parsed.assistantRole).toBe('companion');
  expect(parsed.empathyLevel).toBe('balanced');
  expect(parsed.addressForm).toBe('vy');
  expect(parsed.recommendationsEnabled).toBe(true);
  expect(parsed).not.toHaveProperty('historyAccess');
  expect(settingsEqual(parsed,legacy)).toBe(true);
});
it('direct address, personality and empathy are validated and never grant memory',()=>{
  let value=updateAiPreference(AI_SETTINGS_DEFAULTS,'assistantRole','challenger');
  value=updateAiPreference(value,'empathyLevel','high');
  value=updateAiPreference(value,'addressForm','ty');
  expect(value).toEqual(expect.objectContaining({
    assistantRole:'challenger',empathyLevel:'high',addressForm:'ty',
    recommendationsEnabled:false
  }));
  expect(parseAiSettings({...value,assistantRole:'licensed-therapist'})).toBeNull();
  expect(parseAiSettings({...value,empathyLevel:'ignore-safety'})).toBeNull();
  expect(parseAiSettings({...value,addressForm:'administrator'})).toBeNull();
});
