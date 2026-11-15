/** Owner-facing limits mirrored by the server. Selection is NOT consent. */
export const CONTEXT_LEVELS = Object.freeze({
  optimal: Object.freeze({ label: 'Оптимальный', maxTurns: 2, maxBytes: 400 }),
  detailed: Object.freeze({ label: 'Подробный', maxTurns: 4, maxBytes: 800 }),
  deep: Object.freeze({ label: 'Глубокий', maxTurns: 6, maxBytes: 1100 })
});
export const DEFAULT_CONTEXT_LEVEL = 'optimal';
export function contextLevelPolicy(value) {
  if (typeof value !== 'string' || !Object.hasOwn(CONTEXT_LEVELS, value)) {
    throw new Error('invalid-context-level');
  }
  return CONTEXT_LEVELS[value];
}
