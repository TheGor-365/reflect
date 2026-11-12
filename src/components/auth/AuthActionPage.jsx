import React, { useEffect, useRef, useState } from 'react';
import { checkActionCode, getIdToken, reload } from 'firebase/auth';
import { auth } from '../../firebase/config';
import { completeEmailVerification, completePasswordReset } from '../../hooks/accountAccess';
import { safeAuthActionError } from '../../auth/actionIntent';

const OPERATIONS = Object.freeze({
  verifyEmail: {
    title: 'Подтверждение email',
    intro: 'Проверьте адрес для существующего аккаунта Reflect.',
    action: 'Подтвердить адрес',
    done: 'Email подтверждён.'
  },
  verifyAndChangeEmail: {
    title: 'Подтверждение нового email',
    intro: 'Завершите ранее запрошенную смену адреса. Это не создаёт новый аккаунт.',
    action: 'Подтвердить новый адрес',
    done: 'Новый email подтверждён. В Reflect проверьте обновлённый адрес перед выходом из аккаунта.'
  },
  recoverEmail: {
    title: 'Отмена смены email',
    intro: 'Отмените ранее выполненную смену адреса, только если вы запросили восстановление.',
    action: 'Вернуть прежний адрес',
    done: 'Восстановление адреса подтверждено. Проверьте настройки безопасности аккаунта.'
  },
  resetPassword: {
    title: 'Новый пароль',
    intro: 'Создайте новый пароль для существующего аккаунта. Данные дневника не изменяются.',
    action: 'Сохранить новый пароль',
    done: 'Пароль изменён. Войдите в существующий аккаунт через Reflect.'
  }
});

const returnToActiveAccount = () => window.location.replace('/');

/**
 * Verifying possession of an email is NOT equivalent to signing in.
 * The email action can be opened in Chrome while an account is in Firefox.
 * Redirect to the diary automatically ONLY when the currently authenticated
 * Firebase user already belongs to the verified email and keeps the same UID.
 */
async function reconcileVerifiedActiveAccount(email) {
  try {
    await auth.authStateReady?.();
    const user = auth.currentUser;
    const uid = user?.uid;
    if (!uid || user.isAnonymous ||
        String(user.email || '').trim().toLowerCase() !== email) return false;
    await reload(user);
    if (auth.currentUser?.uid !== uid || user.uid !== uid ||
        !user.emailVerified ||
        String(user.email || '').trim().toLowerCase() !== email) return false;
    // A protected backend sees refreshed verified claims on future requests.
    await getIdToken(user, true);
    return auth.currentUser?.uid === uid;
  } catch {
    // Network/provider error after successful verification must not be
    // mislabeled as a failed email action or start an anonymous session.
    return false;
  }
}

export default function AuthActionPage({
  intent, onReturnToActiveAccount = returnToActiveAccount
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [canReturnToActiveAccount, setCanReturnToActiveAccount] = useState(false);
  const busyRef = useRef(false);
  const automaticEmailAction = useRef(null);
  const operation = intent?.valid ? OPERATIONS[intent.mode] : null;
  const autoVerifyEmail = Boolean(operation && intent?.mode === 'verifyEmail');

  useEffect(() => {
    if (!autoVerifyEmail) return undefined;
    // Keep one in-flight operation across React StrictMode effect replays.
    // Firebase action codes are single-use and must never be retried on remount.
    if (!automaticEmailAction.current) {
      automaticEmailAction.current = (async () => {
        // Validate the action's true destination before consuming the code;
        // never trust an arbitrary continueUrl, injected email or query field.
        const info = await checkActionCode(auth, intent.code);
        const email = String(info?.data?.email || '').trim().toLowerCase();
        if (!email) throw Object.assign(new Error('invalid action'), {
          code: 'auth/invalid-action-code'
        });
        await completeEmailVerification(intent.code);
        const canReturn = await reconcileVerifiedActiveAccount(email);
        return canReturn;
      })();
    }

    let mounted = true;
    setBusy(true);
    setError('');
    automaticEmailAction.current.then(canReturn => {
      if (!mounted) return;
      setCanReturnToActiveAccount(canReturn);
      setDone(true);
      if (canReturn) onReturnToActiveAccount();
    }).catch(failure => {
      if (!mounted) return;
      setError(safeAuthActionError(failure));
    }).finally(() => {
      if (mounted) setBusy(false);
    });
    return () => { mounted = false; };
  }, [autoVerifyEmail, intent?.code, onReturnToActiveAccount]);
  const theme = typeof document !== 'undefined' &&
    document.documentElement.dataset.reflectTheme === 'light' ? 'light' : 'dark';

  async function submit(event) {
    event.preventDefault();
    if (busyRef.current || done || !operation) return;
    const nextPassword = password;
    if (intent.mode === 'resetPassword' &&
        (nextPassword.length < 10 || nextPassword !== confirmation)) {
      setPassword(''); setConfirmation('');
      setError(nextPassword.length < 10
        ? 'Пароль должен содержать не менее 10 символов.'
        : 'Пароли не совпадают. Повторите ввод.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    // Password inputs are cleared before any network request. Only the
    // transient local variable survives until Firebase settles the promise.
    setPassword(''); setConfirmation('');
    try {
      if (intent.mode === 'resetPassword') {
        await completePasswordReset(intent.code, nextPassword);
      } else {
        await completeEmailVerification(intent.code);
      }
      setDone(true);
    } catch (failure) {
      setError(safeAuthActionError(failure));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="reflect-app" data-theme={theme}>
      <main className="reflect-auth-overlay">
        <section className="reflect-auth-card" aria-labelledby="reflect-action-title">
          <div className="reflect-auth-mark" aria-hidden="true"><span>R</span></div>
          <p className="reflect-auth-eyebrow">REFLECT · ДОСТУП К АККАУНТУ</p>
          <h1 id="reflect-action-title">
            {operation ? operation.title : 'Ссылка недействительна'}
          </h1>
          <p className="reflect-auth-intro">
            {operation ? operation.intro :
              'Не удалось проверить назначение ссылки. Откройте новое письмо из приложения.'}
          </p>
          {done ? (
            <p className="reflect-auth-notice" role="status">
              {autoVerifyEmail
                ? canReturnToActiveAccount
                  ? 'Email подтверждён. Открываем ваш дневник Reflect…'
                  : 'Email подтверждён. В этом браузере нет подходящей активной сессии. Войдите в существующий аккаунт Reflect с вашим паролем — новый профиль создавать не нужно.'
                : operation.done}
            </p>
          ) : autoVerifyEmail ? (
            error
              ? <p className="reflect-auth-error" role="alert">{error}</p>
              : <p className="reflect-auth-notice" role="status">
                  {busy ? 'Подтверждаем адрес электронной почты…' : 'Проверяем ссылку…'}
                </p>
          ) : operation ? (
            <form className="reflect-auth-form" onSubmit={submit}>
              {intent.mode === 'resetPassword' && (
                <>
                  <label htmlFor="reflect-action-password">Новый пароль
                    <span className="reflect-auth-field">
                      <input id="reflect-action-password" type="password"
                        autoComplete="new-password" minLength={10}
                        value={password} disabled={busy} required
                        onChange={event => setPassword(event.target.value)} />
                    </span>
                  </label>
                  <label htmlFor="reflect-action-confirm">Повторите пароль
                    <span className="reflect-auth-field">
                      <input id="reflect-action-confirm" type="password"
                        autoComplete="new-password" minLength={10}
                        value={confirmation} disabled={busy} required
                        onChange={event => setConfirmation(event.target.value)} />
                    </span>
                  </label>
                </>
              )}
              {error && <p className="reflect-auth-error" role="alert">{error}</p>}
              <button type="submit" className="reflect-auth-primary"
                disabled={busy}>{busy ? 'Проверяем…' : operation.action}</button>
            </form>
          ) : null}
          <p className="reflect-auth-notice">
            Подтверждение адреса не создаёт новый UID и не открывает чужой дневник.
            Автоматический вход возможен только при уже действующей сессии того
            же аккаунта в этом браузере. В другом браузере потребуется вход.
          </p>
          <a href="/" className="reflect-auth-secondary">
            На главную Reflect
          </a>
        </section>
      </main>
    </div>
  );
}
