"use strict";

/**
 * AI-01B.2: Server-side parser for the UID-scoped settings document.
 *
 * Preferences never grant the right to read diary/history, call the provider,
 * save recommendations, or schedule background work. Enforce independently
 * against authenticated scope grants and the existing quota + safety gates.
 *
 * Until the live handler is explicitly migrated, this is a pure prototype.
 */
const SETTINGS_VERSION = 1;
const DEFAULTS = Object.freeze({
  schemaVersion: SETTINGS_VERSION,
  responseDepth: "balanced",
  responseTone: "analytical",
  askClarifyingQuestions: true,
  recommendationsEnabled: false,
  autoSaveRecommendations: false,
  recommendationFrequency: "rare",
  showContextIndicator: false
});
const OPTIONS = Object.freeze({
  responseDepth: Object.freeze(["concise", "balanced", "deep"]),
  responseTone: Object.freeze(["supportive", "analytical", "strategic"]),
  recommendationFrequency: Object.freeze(["rare", "balanced"])
});
const BOOLEANS = Object.freeze([
  "askClarifyingQuestions", "recommendationsEnabled",
  "autoSaveRecommendations", "showContextIndicator"
]);
const ALLOWED = new Set(["schemaVersion", "updatedAt", ...BOOLEANS,
  ...Object.keys(OPTIONS)]);
const plain = v => v !== null && typeof v === "object" &&
  Object.getPrototypeOf(v) === Object.prototype;

function parseOwnerAiPreferences(raw) {
  if (!plain(raw) || raw.schemaVersion !== SETTINGS_VERSION ||
      Object.keys(raw).some(key => !ALLOWED.has(key))) return null;
  const parsed = { schemaVersion: SETTINGS_VERSION };
  for (const [field, choices] of Object.entries(OPTIONS)) {
    if (!choices.includes(raw[field])) return null;
    parsed[field] = raw[field];
  }
  for (const field of BOOLEANS) {
    if (typeof raw[field] !== "boolean") return null;
    parsed[field] = raw[field];
  }
  if (parsed.autoSaveRecommendations && !parsed.recommendationsEnabled) return null;
  return Object.freeze(parsed);
}

function settingsSnapshot(raw) {
  const valid = parseOwnerAiPreferences(raw);
  return Object.freeze({
    status: valid ? "valid" : raw == null ? "missing" : "invalid",
    preferences: valid || DEFAULTS,
    // These two powers must be independently granted by verified server logic.
    canReadArchive: false,
    canGenerateBackgroundRecommendations: false,
    canScheduleReminders: false
  });
}
module.exports = { SETTINGS_VERSION, DEFAULTS, parseOwnerAiPreferences, settingsSnapshot };
