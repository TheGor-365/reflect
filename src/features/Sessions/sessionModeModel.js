/**
 * M4.2 — owner-controlled dialog behavior for ONE saved session.
 * A mode is a preference only; it is not a grant to read history or a budget.
 * "account" means use the user's account-level AI Settings preference.
 */
import { AI_SETTINGS_OPTIONS } from '../AISettings/aiSettingsModel';

export const ACCOUNT_MODE = 'account';
export const MODE_OPTIONS = Object.freeze([
  Object.freeze([ACCOUNT_MODE, 'Как в настройках AI']),
  Object.freeze(['reflection', 'Рефлексия']),
  Object.freeze(['support', 'Поддержка']),
  Object.freeze(['coach', 'Коучинг']),
  Object.freeze(['companion', 'Собеседник']),
  Object.freeze(['analytic', 'Аналитика'])
]);

export function normalizedSessionMode(value) {
  if (value === undefined || value === null || value === ACCOUNT_MODE) {
    return ACCOUNT_MODE;
  }
  return AI_SETTINGS_OPTIONS.interactionMode.includes(value) ? value : null;
}

/** The server must resolve the same enum from the committed user turn. */
export function turnModeFields(value) {
  const mode = normalizedSessionMode(value);
  if (mode === null) throw new Error('invalid-session-mode');
  return mode === ACCOUNT_MODE ? {} : { interactionMode: mode };
}
