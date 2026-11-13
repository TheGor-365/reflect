/**
 * User-authored preferences, not authorization to read history or spend tokens.
 * The server must independently validate these fields and verify source grants.
 * A missing/invalid settings document NEVER enables recommendations or memory.
 */
export const AI_SETTINGS_VERSION = 1;

export const AI_SETTINGS_DEFAULTS = Object.freeze({
  schemaVersion: AI_SETTINGS_VERSION,
  responseDepth: 'balanced',
  responseTone: 'analytical',
  assistantRole: 'companion',
  empathyLevel: 'balanced',
  addressForm: 'vy',
  askClarifyingQuestions: true,
  recommendationsEnabled: false,
  autoSaveRecommendations: false,
  recommendationFrequency: 'rare',
  showContextIndicator: false
});

export const AI_SETTINGS_OPTIONS = Object.freeze({
  responseDepth: Object.freeze(['concise', 'balanced', 'deep']),
  responseTone: Object.freeze(['supportive', 'analytical', 'strategic']),
  assistantRole: Object.freeze(['companion', 'mentor', 'challenger', 'reflective']),
  empathyLevel: Object.freeze(['low', 'balanced', 'high']),
  addressForm: Object.freeze(['vy', 'ty']),
  recommendationFrequency: Object.freeze(['rare', 'balanced'])
});

const isObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseAiSettings(raw) {
  if (!isObject(raw) || raw.schemaVersion !== AI_SETTINGS_VERSION) return null;
  const output = { schemaVersion: AI_SETTINGS_VERSION };
  for (const field of ['responseDepth', 'responseTone', 'recommendationFrequency']) {
    if (!AI_SETTINGS_OPTIONS[field].includes(raw[field])) return null;
    output[field] = raw[field];
  }
  for (const field of [
    'askClarifyingQuestions', 'recommendationsEnabled',
    'autoSaveRecommendations', 'showContextIndicator'
  ]) {
    if (typeof raw[field] !== 'boolean') return null;
    output[field] = raw[field];
  }
  // Optional V1 additions: existing owner preferences stay valid, with
  // conservative defaults, until the owner explicitly chooses a role.
  for (const field of ['assistantRole', 'empathyLevel', 'addressForm']) {
    const value = raw[field] === undefined ? AI_SETTINGS_DEFAULTS[field] : raw[field];
    if (!AI_SETTINGS_OPTIONS[field].includes(value)) return null;
    output[field] = value;
  }
  if (output.autoSaveRecommendations && !output.recommendationsEnabled) return null;
  return output;
}

export function updateAiPreference(settings, name, value) {
  if (!Object.hasOwn(AI_SETTINGS_DEFAULTS, name) || name === 'schemaVersion') {
    return settings;
  }
  const next = { ...settings, [name]: value };
  if (name === 'recommendationsEnabled' && value === false) {
    next.autoSaveRecommendations = false;
  }
  return parseAiSettings(next) ?? settings;
}

export function settingsEqual(left, right) {
  return JSON.stringify(parseAiSettings(left)) === JSON.stringify(parseAiSettings(right));
}
