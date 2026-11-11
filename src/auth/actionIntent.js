/**
 * Firebase email action codes are secret, single-use URL capabilities.
 * Parse them only in memory, check they belong to this Firebase project's
 * public API key, and strip every query parameter before mounting React.
 * Never follow continueUrl or echo a code, email, UID, or raw SDK error.
 */
export const AUTH_ACTION_PATH = '/auth/action';
const MODES = new Set([
  'verifyEmail', 'verifyAndChangeEmail', 'resetPassword', 'recoverEmail'
]);
const INVALID = Object.freeze({ valid: false, mode: null, code: null });

export function parseAuthActionIntent(search, expectedApiKey) {
  if (typeof search !== 'string' || typeof expectedApiKey !== 'string' ||
      !expectedApiKey) return INVALID;
  const params = new URLSearchParams(search);
  if (['mode', 'oobCode', 'apiKey'].some(key => params.getAll(key).length !== 1)) {
    return INVALID;
  }
  const mode = params.get('mode');
  const code = params.get('oobCode');
  const key = params.get('apiKey');
  if (!MODES.has(mode) || key !== expectedApiKey ||
      typeof code !== 'string' || !/^[a-zA-Z0-9_-]{6,2048}$/.test(code)) {
    return INVALID;
  }
  return Object.freeze({ valid: true, mode, code });
}

export function safeAuthActionError(error) {
  if (error?.code === 'auth/weak-password') {
    return 'Новый пароль недостаточно надёжен. Выберите более длинный уникальный пароль.';
  }
  if (error?.code === 'auth/expired-action-code' ||
      error?.code === 'auth/invalid-action-code') {
    return 'Ссылка недействительна или уже использована. Запросите новую ссылку из приложения.';
  }
  if (error?.code === 'auth/network-request-failed') {
    return 'Нет соединения с Firebase. Проверьте сеть и повторите действие.';
  }
  if (error?.code === 'auth/too-many-requests') {
    return 'Слишком много попыток. Повторите позже.';
  }
  // Never display a raw Firebase error, query value, or SDK exception.
  return 'Операцию не удалось подтвердить. Запросите новую ссылку или повторите позже.';
}
