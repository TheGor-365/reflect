import {
  EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, sendEmailVerification, reload, confirmPasswordReset
} from 'firebase/auth';
import { auth } from '../firebase/config';

/**
 * Account upgrade preserves the active anonymous Firebase UID and its Firestore
 * ownership paths. Signing in to a different UID is never an implicit upgrade.
 * No password is stored in app state beyond the explicit form lifetime.
 */
export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function validateCredentials(email, password, { creating = true } = {}) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) {
    throw new Error('Введите корректный email.');
  }
  if (typeof password !== 'string' || (creating ? password.length < 10 : password.length === 0)) {
    throw new Error(creating ? 'Пароль должен содержать не менее 10 символов.' : 'Введите пароль.');
  }
}

export function accountErrorMessage(error) {
  if (error instanceof Error && !error.message.startsWith('Firebase:') &&
      !String(error.code || '').startsWith('auth/')) {
    return error.message;
  }
  const code = error?.code;
  const known = {
    'auth/email-already-in-use': 'Этот email уже зарегистрирован. Войдите в существующий аккаунт. Текущие анонимные данные не переключались.',
    'auth/credential-already-in-use': 'Этот email уже привязан к другому аккаунту. Текущий UID сохранён.',
    'auth/invalid-credential': 'Не удалось войти. Проверьте email и пароль.',
    'auth/wrong-password': 'Не удалось войти. Проверьте email и пароль.',
    'auth/user-not-found': 'Аккаунт не найден. Проверьте email или зарегистрируйтесь.',
    'auth/too-many-requests': 'Слишком много попыток. Повторите позже.',
    'auth/network-request-failed': 'Нет соединения с сервисом авторизации. Проверьте сеть и повторите.',
    'auth/weak-password': 'Слишком простой пароль. Используйте более длинную уникальную комбинацию.',
    'auth/operation-not-allowed': 'Вход по email сейчас не включён в Firebase Authentication.',
    'auth/requires-recent-login': 'Для операции необходимо повторно войти в аккаунт.'
  };
  return known[code] || 'Не удалось выполнить операцию с аккаунтом. Повторите попытку.';
}

export async function registerCurrentAnonymous(email, password) {
  validateCredentials(email, password);
  const current = auth.currentUser;
  if (!current?.uid || !current.isAnonymous) {
    throw new Error('Регистрация доступна для текущего гостевого аккаунта. Уже зарегистрированный аккаунт менять не нужно.');
  }
  const originalUid = current.uid;
  const credential = EmailAuthProvider.credential(normalizeEmail(email), password);
  const result = await linkWithCredential(current, credential);
  if (result.user.uid !== originalUid) {
    throw new Error('Не удалось подтвердить сохранение UID. Не продолжайте работу до проверки аккаунта.');
  }
  // Some auth backends can acknowledge linking without exposing the new
  // password provider yet; do not show a false "account created" state.
  if (result.user.isAnonymous || normalizeEmail(result.user.email) !== normalizeEmail(email)) {
    throw new Error('Привязка email не подтверждена. Не выходите из гостевого аккаунта; повторите проверку доступа.');
  }
  return result.user;
}

export async function signInExisting(email, password, { hasLocalData = false } = {}) {
  validateCredentials(email, password, { creating: false });
  if (hasLocalData) {
    throw new Error('В этом гостевом аккаунте уже есть записи. Сначала привяжите к нему email: вход в другой UID может сделать эти данные недоступными.');
  }
  return (await signInWithEmailAndPassword(auth, normalizeEmail(email), password)).user;
}

export async function signOutRegistered() {
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    throw new Error('Гостевой аккаунт нельзя отключать: его данные могут стать недоступны.');
  }
  await signOut(auth);
}


/**
 * Recovery sends an Auth-provider email, never changes the active UID.
 * Keep the same generic UI response for registered/unregistered addresses;
 * the Auth service may apply its own enumeration protection/rate limits.
 */
export async function requestPasswordReset(email) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Введите корректный email.');
  }
  await sendPasswordResetEmail(auth, normalized);
}

export async function requestEmailVerification() {
  const current = auth.currentUser;
  if (!current || current.isAnonymous || !current.email) {
    throw new Error('Сначала войдите в зарегистрированный аккаунт.');
  }
  if (current.emailVerified) return;
  await sendEmailVerification(current);
}

export async function refreshVerificationStatus() {
  const current = auth.currentUser;
  if (!current || current.isAnonymous || !current.email) {
    throw new Error('Сначала войдите в зарегистрированный аккаунт.');
  }
  const originalUid = current.uid;
  await reload(current);
  if (auth.currentUser?.uid !== originalUid) {
    throw new Error('Изменился идентификатор аккаунта. Доступ не подтверждён.');
  }
  return auth.currentUser;
}

/** Testable SDK boundary; codes must never be logged or persisted by Reflect. */
export async function completePasswordReset(code, nextPassword) {
  if (typeof code !== 'string' || !code) throw new Error('Код восстановления отсутствует.');
  if (typeof nextPassword !== 'string' || nextPassword.length < 10) {
    throw new Error('Новый пароль должен содержать не менее 10 символов.');
  }
  await confirmPasswordReset(auth, code, nextPassword);
}
