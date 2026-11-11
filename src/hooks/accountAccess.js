import {
  EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, sendEmailVerification, reload, confirmPasswordReset,
  applyActionCode, verifyBeforeUpdateEmail, reauthenticateWithCredential
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { applyAuthEmailLocale } from '../i18n/authEmailLocale';
import { clearExplicitlySignedOut, isExplicitlySignedOut, setExplicitlySignedOut } from './accountSession';

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
    'auth/requires-recent-login': 'Для смены email подтвердите личность текущим паролем. Выходить из аккаунта не нужно.',
    'auth/user-mismatch': 'Пароль относится к другому аккаунту. Текущая сессия не изменена.'
  };
  return known[code] || 'Не удалось выполнить операцию с аккаунтом. Повторите попытку.';
}

export async function registerCurrentAnonymous(email, password, { onVerificationDelivery } = {}) {
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
  // A successful account link is permanent even if verification mail fails.
  // Do not surface a false registration failure or attempt a second link.
  // The existing account UI offers an explicit resend/recheck action.
  let delivery = 'already-verified';
  if (!result.user.emailVerified) {
    delivery = 'failed';
    try {
      applyAuthEmailLocale(auth);
      await sendEmailVerification(result.user);
      delivery = 'sent';
    } catch {
      // The permanent link succeeded. Do not claim the whole registration
      // failed or retry it; show an honest delivery status with a resend action.
    }
  }
  onVerificationDelivery?.(delivery);
  return result.user;
}

export async function signInExisting(email, password, { hasLocalData = false } = {}) {
  validateCredentials(email, password, { creating: false });
  if (hasLocalData) {
    throw new Error('В этом гостевом аккаунте уже есть записи. Сначала привяжите к нему email: вход в другой UID может сделать эти данные недоступными.');
  }
  const account = (await signInWithEmailAndPassword(auth, normalizeEmail(email), password)).user;
  clearExplicitlySignedOut();
  return account;
}

export async function signOutRegistered() {
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    throw new Error('Гостевой аккаунт нельзя отключать: его данные могут стать недоступны.');
  }
  // Mark the intent before Firebase emits its null Auth event, so the
  // listener renders a sign-in screen rather than creating a new guest.
  const wasSignedOut = isExplicitlySignedOut();
  setExplicitlySignedOut();
  try {
    await signOut(auth);
  } catch (error) {
    // If Auth rejected sign-out, preserve the live registered session.
    if (!wasSignedOut) clearExplicitlySignedOut();
    throw error;
  }
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
  applyAuthEmailLocale(auth);
  await sendPasswordResetEmail(auth, normalized);
}

export async function requestEmailVerification() {
  const current = auth.currentUser;
  if (!current || current.isAnonymous || !current.email) {
    throw new Error('Сначала войдите в зарегистрированный аккаунт.');
  }
  if (current.emailVerified) return;
  applyAuthEmailLocale(auth);
  await sendEmailVerification(current);
}

/**
 * Change a registered user's unreachable address WITHOUT switching UID or
 * touching Firestore data. Firebase first verifies the destination email;
 * until the action link is consumed the previous sign-in email remains.
 */
export async function requestEmailChange(nextEmail) {
  const current = auth.currentUser;
  if (!current?.uid || current.isAnonymous || !current.email) {
    throw new Error('Сначала войдите в зарегистрированный аккаунт.');
  }
  const normalized = normalizeEmail(nextEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Введите корректный новый email.');
  }
  if (normalized === normalizeEmail(current.email)) {
    throw new Error('Новый email должен отличаться от текущего.');
  }
  const previousUid = current.uid;
  applyAuthEmailLocale(auth);
  await verifyBeforeUpdateEmail(current, normalized);
  if (auth.currentUser?.uid !== previousUid) {
    throw new Error('Изменился идентификатор аккаунта. Не продолжайте работу до проверки доступа.');
  }
  return true;
}

/**
 * Reauthenticate an ALREADY SIGNED-IN account in place, only after Firebase
 * explicitly returned auth/requires-recent-login. Never call signOut or
 * signInWithEmailAndPassword here: the user keeps the exact same UID and docs.
 * The UI passes a transient password and clears it after this Promise settles.
 */
export async function reauthenticateAndRequestEmailChange(nextEmail, currentPassword) {
  const current = auth.currentUser;
  if (!current?.uid || current.isAnonymous || !current.email) {
    throw new Error('Для смены email нужен текущий зарегистрированный аккаунт.');
  }
  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    throw new Error('Введите текущий пароль аккаунта для подтверждения личности.');
  }
  const originalUid = current.uid;
  const credential = EmailAuthProvider.credential(
    normalizeEmail(current.email), currentPassword
  );
  await reauthenticateWithCredential(current, credential);
  if (auth.currentUser?.uid !== originalUid) {
    throw new Error('Изменился идентификатор аккаунта. Смена email отменена.');
  }
  return requestEmailChange(nextEmail);
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


/** Used by a future verified action handler and synthetic emulator E2E. */
export async function completeEmailVerification(code) {
  if (typeof code !== 'string' || !code) throw new Error('Код подтверждения отсутствует.');
  await applyActionCode(auth, code);
}
